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

logger = logging.getLogger("zahara.api.run_executor")

ROUTER_BASE_URL = os.getenv("LLM_ROUTER_URL")


def _decrypt_secret(enc: str) -> str:
    # If you later add real encryption, plug it in here.
    return enc


def _estimate_cost_usd(model: Optional[str], usage: Dict[str, Any]) -> Optional[float]:
    if not usage:
        return None

    total_tokens = usage.get("total_tokens") or usage.get("totalTokens")
    if not isinstance(total_tokens, int):
        try:
            total_tokens = int(total_tokens)
        except Exception:
            return None

    if total_tokens <= 0:
        return None

    per_1k = 0.000002
    model_lower = (model or "").lower()
    if "gpt-4.1" in model_lower or "gpt-4o" in model_lower:
        per_1k = 0.00001
    elif "gpt-3.5" in model_lower or "gpt-4.0-mini" in model_lower:
        per_1k = 0.000002

    cost = (total_tokens / 1000.0) * per_1k
    return round(cost, 6)


def _resolve_provider_and_model(spec_content: Dict[str, Any]) -> tuple[str, str]:
    """
    Extract provider + model from the agent spec.

    We assume Job 6 unified spec roughly follows:
    {
      "mode": "flow" | "pro" | "vibe" | ...,
      "model": "gpt-4.1-mini",
      "provider": "openai",
      ...
    }
    """
    provider = spec_content.get("provider") or "openai"
    model = spec_content.get("model") or os.getenv("DEFAULT_MODEL", "gpt-4.1-mini")
    return provider, model


def _lookup_provider_key(
    db: Session, user_id: Optional[int], provider: str
) -> Optional[ProviderKeyModel]:
    if not user_id:
        return None
    return (
        db.query(ProviderKeyModel)
        .filter(
            ProviderKeyModel.user_id == user_id,
            ProviderKeyModel.provider == provider,
        )
        .order_by(ProviderKeyModel.created_at.desc())
        .first()
    )


def execute_run_via_router(run_id: str) -> None:
    """
    Central LLM router executor.

    - Load run + agent + latest spec
    - Resolve provider + model
    - Look up user's provider key for that provider
    - Call router /v1/chat/completions with the key
    - Write token + done events and update metrics on the run
    """
    db: Session = SessionLocal()
    try:
        run: Optional[RunModel] = (
            db.query(RunModel).filter(RunModel.id == run_id).first()
        )
        if not run:
            logger.warning("execute_run_via_router: run %s not found", run_id)
            return

        if run.status not in ("pending", "running"):
            logger.info(
                "execute_run_via_router: run %s already in terminal status %s",
                run_id,
                run.status,
            )
            return

        if not run.agent_id:
            logger.error("execute_run_via_router: run %s has no agent_id", run_id)
            run.status = "error"
            run.error_message = "No agent configured for this run."
            db.add(run)
            db.commit()
            return

        agent: Optional[AgentModel] = (
            db.query(AgentModel).filter(AgentModel.id == run.agent_id).first()
        )
        if not agent:
            logger.error(
                "execute_run_via_router: agent %s not found for run %s",
                run.agent_id,
                run_id,
            )
            run.status = "error"
            run.error_message = "Agent not found."
            db.add(run)
            db.commit()
            return

        spec: Optional[AgentSpecModel] = (
            db.query(AgentSpecModel)
            .filter(AgentSpecModel.agent_id == agent.id)
            .order_by(AgentSpecModel.version.desc())
            .first()
        )
        if not spec:
            logger.error(
                "execute_run_via_router: no spec for agent %s (run %s)",
                agent.id,
                run_id,
            )
            run.status = "error"
            run.error_message = "No spec configured for agent."
            db.add(run)
            db.commit()
            return

        config: Dict[str, Any] = run.config or {}
        input_text = config.get("input") or ""
        if not input_text:
            logger.warning("execute_run_via_router: run %s has empty input", run_id)

        spec_content: Dict[str, Any] = spec.content or {}
        provider, model = _resolve_provider_and_model(spec_content)
        system_prompt = (
            spec_content.get("systemPrompt")
            or spec_content.get("system_prompt")
            or "You are a helpful assistant."
        )
        temperature = spec_content.get("temperature", 0.7)

        # Resolve provider key for the user
        provider_key = _lookup_provider_key(db, run.user_id, provider)
        if not provider_key:
            logger.error(
                "execute_run_via_router: no provider key for user %s provider %s",
                run.user_id,
                provider,
            )
            run.status = "error"
            run.error_message = (
                f"No provider key configured for provider '{provider}'. "
                "Add a key in the Provider Settings."
            )
            db.add(run)
            db.add(
                RunEventModel(
                    run_id=run.id,
                    type="error",
                    payload={
                        "message": "No provider key configured",
                        "provider": provider,
                    },
                )
            )
            db.add(
                RunEventModel(
                    run_id=run.id,
                    type="done",
                    payload={"status": "error", "request_id": run.request_id},
                )
            )
            db.commit()
            return

        key_secret = _decrypt_secret(provider_key.encrypted_key)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": input_text},
        ]

        payload = {
            "model": model,
            "provider": provider,
            "messages": messages,
            "temperature": temperature,
        }

        url = ROUTER_BASE_URL.rstrip("/") + "/v1/chat/completions"
        logger.info(
            "execute_run_via_router: run %s -> %s model=%s provider=%s",
            run_id,
            url,
            model,
            provider,
        )

        start = time.time()
        try:
            resp = httpx.post(
                url,
                json=payload,
                headers={"X-Provider-Api-Key": key_secret},
                timeout=60.0,
            )
        except Exception as e:
            logger.exception("Router request failed for run %s", run_id)
            run.status = "error"
            run.error_message = f"Router error: {e}"
            db.add(run)
            db.add(
                RunEventModel(
                    run_id=run.id,
                    type="error",
                    payload={"message": str(e), "stage": "router_request"},
                )
            )
            db.add(
                RunEventModel(
                    run_id=run.id,
                    type="done",
                    payload={"status": "error", "request_id": run.request_id},
                )
            )
            db.commit()
            return

        elapsed_ms = int((time.time() - start) * 1000)
        run.latency_ms = elapsed_ms

        if resp.status_code != 200:
            logger.error(
                "Router returned %s for run %s: %s",
                resp.status_code,
                run_id,
                resp.text,
            )
            run.status = "error"
            run.error_message = f"Router HTTP {resp.status_code}"
            db.add(run)
            db.add(
                RunEventModel(
                    run_id=run.id,
                    type="error",
                    payload={
                        "message": "Router error",
                        "status_code": resp.status_code,
                        "body": resp.text,
                    },
                )
            )
            db.add(
                RunEventModel(
                    run_id=run.id,
                    type="done",
                    payload={"status": "error", "request_id": run.request_id},
                )
            )
            db.commit()
            return

        data = resp.json()
        usage = data.get("usage") or {}
        provider_from_resp = data.get("provider") or provider
        assistant_content = ""
        try:
            choices = data.get("choices") or []
            if choices:
                msg = choices[0].get("message") or {}
                assistant_content = msg.get("content") or ""
        except Exception:
            assistant_content = ""

        run.model = data.get("model") or model
        run.provider = provider_from_resp
        run.tokens_in = usage.get("prompt_tokens")
        run.tokens_out = usage.get("completion_tokens")
        run.tokens_total = usage.get("total_tokens")
        run.cost_estimate_usd = _estimate_cost_usd(run.model, usage)
        run.status = "success"
        db.add(run)

        if assistant_content:
            db.add(
                RunEventModel(
                    run_id=run.id,
                    type="token",
                    payload={
                        "text": assistant_content,
                        "index": 0,
                        "is_final": True,
                    },
                )
            )

        db.add(
            RunEventModel(
                run_id=run.id,
                type="done",
                payload={
                    "status": "success",
                    "request_id": run.request_id,
                },
            )
        )

        db.commit()
        logger.info("execute_run_via_router: run %s completed successfully", run_id)

    except Exception as e:
        logger.exception(
            "Unexpected error in execute_run_via_router for run %s", run_id
        )
        try:
            run = db.query(RunModel).filter(RunModel.id == run_id).first()
            if run:
                run.status = "error"
                run.error_message = f"Unexpected executor error: {e}"
                db.add(run)
                db.add(
                    RunEventModel(
                        run_id=run.id,
                        type="error",
                        payload={"message": str(e), "stage": "executor"},
                    )
                )
                db.add(
                    RunEventModel(
                        run_id=run.id,
                        type="done",
                        payload={"status": "error", "request_id": run.request_id},
                    )
                )
                db.commit()
        except Exception:
            logger.exception("Failed to persist error state for run %s", run_id)
    finally:
        db.close()
