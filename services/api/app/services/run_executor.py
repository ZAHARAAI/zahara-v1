from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.agent import Agent as AgentModel
from ..models.agent_spec import AgentSpec as AgentSpecModel
from ..models.provider_key import ProviderKey as ProviderKeyModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..security.provider_keys_crypto import decrypt_secret
from ..services.daily_usage import upsert_daily_usage

logger = logging.getLogger("zahara.api.run_executor")

ROUTER_BASE_URL = os.getenv("LLM_ROUTER_URL")


def _estimate_cost_usd(model: Optional[str], usage: Dict[str, Any]) -> Optional[float]:
    if not usage:
        return None
    total_tokens = usage.get("total_tokens")
    if not total_tokens:
        return None
    price_per_1k = {
        "gpt-4.1-mini": 0.15,
        "gpt-4o-mini": 0.15,
    }
    p = price_per_1k.get(model or "")
    if p is None:
        return None
    return float(total_tokens) / 1000.0 * p


def _pick_provider_and_model(spec_content: Dict[str, Any]) -> tuple[str, str]:
    provider = (spec_content.get("provider") or "openai").strip().lower()
    model = (
        spec_content.get("model") or os.getenv("DEFAULT_MODEL", "gpt-4.1-mini")
    ).strip()
    return provider, model


def _lookup_provider_key(
    db: Session, user_id: Optional[int], provider: str
) -> Optional[ProviderKeyModel]:
    if not user_id:
        return None
    return (
        db.query(ProviderKeyModel)
        .filter(
            ProviderKeyModel.user_id == user_id, ProviderKeyModel.provider == provider
        )
        .order_by(ProviderKeyModel.created_at.desc())
        .first()
    )


def _add_event(db: Session, run_id: str, type_: str, payload: Dict[str, Any]) -> None:
    db.add(RunEventModel(run_id=run_id, type=type_, payload=payload))
    db.commit()


def _parse_sse_data_line(line: str) -> Optional[str]:
    # Router emits OpenAI-style SSE: "data: {...}"
    line = line.strip()
    if not line.startswith("data:"):
        return None
    return line[5:].strip()


def execute_run_via_router(run_id: str) -> None:
    """
    True streaming token execution:

    - Calls router with {"stream": true}
    - Parses SSE chunks
    - Writes token events incrementally to run_events
    - Emits final done and updates run metrics
    """
    db = SessionLocal()
    try:
        run: Optional[RunModel] = (
            db.query(RunModel).filter(RunModel.id == run_id).first()
        )
        if not run:
            logger.error("execute_run_via_router: run %s not found", run_id)
            return

        if run.status not in ("pending", "running"):
            logger.info(
                "execute_run_via_router: run %s status=%s, skipping", run_id, run.status
            )
            return

        if not run.agent_id:
            run.status = "error"
            run.error_message = "No agent configured for this run."
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        agent: Optional[AgentModel] = (
            db.query(AgentModel).filter(AgentModel.id == run.agent_id).first()
        )
        if not agent:
            run.status = "error"
            run.error_message = "Agent not found."
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        spec: Optional[AgentSpecModel] = (
            db.query(AgentSpecModel)
            .filter(AgentSpecModel.agent_id == agent.id)
            .order_by(AgentSpecModel.version.desc())
            .first()
        )
        if not spec:
            run.status = "error"
            run.error_message = "No spec found for agent."
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        spec_content = spec.spec or {}
        provider, model = _pick_provider_and_model(spec_content)

        if not ROUTER_BASE_URL:
            run.status = "error"
            run.error_message = "LLM_ROUTER_URL is not configured."
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        pk = _lookup_provider_key(db, run.user_id, provider)
        if not pk:
            run.status = "error"
            run.error_message = f"No provider key configured for '{provider}'."
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        try:
            api_key = decrypt_secret(pk.encrypted_key)
        except ValueError as e:
            run.status = "error"
            run.error_message = str(e)
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        system_prompt = (
            spec_content.get("system_prompt") or "You are a helpful assistant."
        )
        input_text = (run.input or "").strip()

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": input_text},
        ]

        payload = {
            "model": model,
            "provider": provider,
            "messages": messages,
            "temperature": spec_content.get("temperature", 0.2),
            "stream": True,
        }

        # Mark running
        run.status = "running"
        run.model = model
        run.provider = provider
        db.add(run)
        db.commit()

        t0 = time.time()
        full_text_parts: list[str] = []
        usage_final: Dict[str, Any] = {}

        timeout = httpx.Timeout(120.0, connect=10.0)
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            with httpx.Client(timeout=timeout) as client:
                with client.stream(
                    "POST",
                    f"{ROUTER_BASE_URL.rstrip('/')}/v1/chat/completions",
                    json=payload,
                    headers=headers,
                ) as resp:
                    if resp.status_code >= 400:
                        body_preview = resp.read().decode("utf-8", errors="ignore")[
                            :500
                        ]
                        raise RuntimeError(
                            f"Router returned {resp.status_code}: {body_preview}"
                        )

                    for raw_line in resp.iter_lines():
                        if not raw_line:
                            continue
                        line = raw_line.decode("utf-8", errors="ignore")
                        data_str = _parse_sse_data_line(line)
                        if data_str is None:
                            continue

                        if data_str == "[DONE]":
                            break

                        # Parse chunk JSON (OpenAI-like)
                        try:
                            chunk = json.loads(data_str)
                        except Exception:
                            continue

                        # Common OpenAI delta path:
                        # chunk["choices"][0]["delta"]["content"]
                        delta = ""
                        try:
                            choice0 = (chunk.get("choices") or [{}])[0]
                            delta = (choice0.get("delta") or {}).get("content") or ""
                        except Exception:
                            delta = ""

                        if delta:
                            full_text_parts.append(delta)
                            _add_event(
                                db,
                                run.id,
                                "token",
                                {
                                    "text": delta,
                                    "is_final": False,
                                    "request_id": run.request_id,
                                },
                            )

                        # If router includes usage in a final chunk, keep it
                        if isinstance(chunk.get("usage"), dict):
                            usage_final = chunk["usage"]

        except Exception as e:
            run.status = "error"
            run.error_message = f"Router streaming failed: {e}"
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        dt_ms = int((time.time() - t0) * 1000)
        full_text = "".join(full_text_parts)

        tokens_in = usage_final.get("prompt_tokens")
        tokens_out = usage_final.get("completion_tokens")
        tokens_total = usage_final.get("total_tokens")
        cost = _estimate_cost_usd(model, usage_final) if usage_final else None

        run.latency_ms = dt_ms
        run.tokens_in = tokens_in
        run.tokens_out = tokens_out
        run.tokens_total = tokens_total
        run.cost_estimate_usd = cost
        run.status = "success"
        if run.user_id:
            upsert_daily_usage(
                db=db,
                user_id=run.user_id,
                tokens_total=run.tokens_total,
                cost_usd=run.cost_estimate_usd,
            )
        db.add(run)
        db.commit()

        # Emit final token event (optional but useful for consumers)
        _add_event(
            db,
            run.id,
            "token",
            {
                "text": full_text,
                "is_final": True,
                "request_id": run.request_id,
            },
        )
        _add_event(db, run.id, "done", {"ok": True, "request_id": run.request_id})

    finally:
        db.close()
