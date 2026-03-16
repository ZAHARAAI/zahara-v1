from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models.agent import Agent as AgentModel
from ..models.agent_spec import AgentSpec as AgentSpecModel
from ..models.provider_key import ProviderKey as ProviderKeyModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..security.provider_keys_crypto import decrypt_secret
from ..services.daily_usage import upsert_daily_usage
from ..services.pricing import estimate_cost_usd_with_fallback

logger = logging.getLogger("zahara.api.run_executor")

ROUTER_BASE_URL = os.getenv("LLM_ROUTER_URL")


def _approx_tokens(text: str) -> int:
    # rough heuristic: ~4 chars per token in English-like text
    if not text:
        return 0
    return max(1, int(len(text) / 4))


def _pick_provider_and_model(spec: Dict[str, Any]) -> tuple[str, str]:
    nodes = spec.get("graph", {}).get("nodes", [])

    for node in nodes:
        if node.get("type") == "model":
            data = node.get("data", {})
            provider = data.get("provider")
            model = data.get("model")
            return provider, model

    return None, None


def _get_provider_key(db: Session, user_id: int, provider: str) -> Optional[str]:
    row = (
        db.query(ProviderKeyModel)
        .filter(
            ProviderKeyModel.user_id == user_id,
            ProviderKeyModel.provider == provider,
        )
        .order_by(ProviderKeyModel.created_at.desc())
        .first()
    )
    if not row:
        return None
    try:
        return decrypt_secret(row.encrypted_key)
    except Exception:
        return None


def _add_event(db: Session, run_id: str, type_: str, payload: Dict[str, Any]) -> None:
    max_seq = db.query(func.max(RunEventModel.seq)).filter(RunEventModel.run_id == run_id).scalar()
    db.add(RunEventModel(run_id=run_id, type=type_, payload=payload, seq=(max_seq or 0) + 1))
    db.commit()


def _parse_sse_data_line(line: str) -> Optional[str]:
    line = line.strip()
    if not line.startswith("data:"):
        return None
    return line[5:].strip()


def _coerce_line_to_str(raw_line: Any) -> str:
    """
    httpx Response.iter_lines() can yield str (common) or bytes (depends on transport/config).
    This helper makes it safe.
    """
    if isinstance(raw_line, bytes):
        return raw_line.decode("utf-8", errors="ignore")
    if isinstance(raw_line, str):
        return raw_line
    # extremely defensive fallback
    return str(raw_line)


def _extract_tool_names(tool_calls_data: Any) -> list[str]:
    """Extract tool names from tool_calls event payload."""
    if not isinstance(tool_calls_data, list):
        return []
    
    tool_names = []
    for tool_call in tool_calls_data:
        if isinstance(tool_call, dict):
            # Standard OpenAI format: {"id": "...", "type": "function", "function": {"name": "..."}}
            if tool_call.get("type") == "function":
                func_info = tool_call.get("function")
                if isinstance(func_info, dict) and "name" in func_info:
                    tool_names.append(func_info["name"])
            # Alternative format: {"name": "..."}
            elif "name" in tool_call:
                tool_names.append(tool_call["name"])
    return tool_names


def _check_tool_allowlist(
    agent: AgentModel, tool_names: list[str]
) -> tuple[bool, Optional[str]]:
    """
    Check if all tool names are in the agent's allowlist.
    Returns (is_allowed, error_message).

    Deny-by-default: when tool_allowlist is None, behavior depends on
    TOOL_GOVERNANCE_LEGACY_OPEN (default False = deny all).
    """
    allowlist = getattr(agent, "tool_allowlist", None)
    if allowlist is None:
        if settings.tool_governance_legacy_open:
            return True, None
        # Deny-by-default: no allowlist configured means no tools permitted
        if tool_names:
            return False, (
                "Agent has no tool_allowlist configured (deny-by-default). "
                f"Set tool_allowlist to allow tools: {', '.join(tool_names)}"
            )
        return True, None
    
    if not isinstance(allowlist, list) or not allowlist:
        # Empty allowlist means no tools allowed
        if tool_names:
            return False, f"Agent has empty tool allowlist but tried to use tools: {', '.join(tool_names)}"
        return True, None
    
    # Check each tool against allowlist
    disallowed = [t for t in tool_names if t not in allowlist]
    if disallowed:
        return False, f"Tools not allowed: {', '.join(disallowed)}. Allowed: {', '.join(allowlist)}"
    
    return True, None


def _check_runaway_protection(
    agent: AgentModel, run: RunModel, current_time: datetime
) -> tuple[bool, Optional[str]]:
    """
    Check if run has exceeded max_steps or max_duration limits.
    Returns (is_within_limits, error_message).
    """
    # Check max_steps
    max_steps = getattr(agent, "max_steps_per_run", None)
    if max_steps and max_steps > 0:
        # Count events that represent steps (e.g., tool_calls, tokens)
        # For simplicity, we count all token events as steps
        step_count = 0
        # This would be calculated by counting events during execution
        # For now, we defer this to be calculated inline during event processing
    
    # Check max_duration
    max_duration = getattr(agent, "max_duration_seconds_per_run", None)
    if max_duration and max_duration > 0:
        elapsed = (current_time - run.created_at).total_seconds()
        if elapsed > max_duration:
            return False, f"Run exceeded max duration: {elapsed:.1f}s > {max_duration}s"
    
    return True, None


def execute_run_via_router(run_id: str) -> None:
    """
    Streaming run execution:
    - reads router SSE
    - emits token/log/tool_call/tool_result events
    - writes final run tokens/cost (fallback if missing usage)
    - respects cancellation (status=cancelled)
    """
    db = SessionLocal()
    try:
        run = db.query(RunModel).filter(RunModel.id == run_id).first()
        if not run:
            return

        if run.status == "cancelled":
            _add_event(
                db,
                run.id,
                "cancelled",
                {"message": "Cancelled by user", "request_id": run.request_id},
            )
            return

        agent = (
            db.query(AgentModel).filter(AgentModel.id == run.agent_id).first()
            if run.agent_id
            else None
        )
        if not agent:
            run.status = "error"
            run.error_message = "Agent not found for this run."
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        # Prefer the exact spec tracked on the run for deterministic retries/replays.
        if getattr(run, "agent_spec_id", None):
            spec = (
                db.query(AgentSpecModel)
                .filter(AgentSpecModel.id == run.agent_spec_id)
                .first()
            )
        else:
            spec = (
                db.query(AgentSpecModel)
                .filter(AgentSpecModel.agent_id == agent.id)
                .order_by(AgentSpecModel.version.desc())
                .first()
            )
        if not spec:
            run.status = "error"
            run.error_message = "Agent spec not found."
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        spec_content = (spec.content or {}) if hasattr(spec, "content") else {}
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

        api_key = _get_provider_key(db, run.user_id, provider) if run.user_id else None

        # ENFORCE per-user provider key
        if not api_key:
            run.status = "error"
            run.error_message = (
                f"No provider key configured for provider '{provider}'. "
                "Please add a key in Provider page."
            )
            db.add(run)
            db.commit()
            _add_event(
                db,
                run.id,
                "error",
                {"message": run.error_message, "request_id": run.request_id},
            )
            return

        # mark running
        run.status = "running"
        run.model = model
        run.provider = provider
        run.updated_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()

        _add_event(
            db,
            run.id,
            "system",
            {
                "message": "run_started",
                "request_id": run.request_id,
                "model": model,
                "provider": provider,
            },
        )

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        prompt_text = run.input or ""

        payload = {
            "model": model,
            "stream": True,
            "messages": [
                {
                    "role": "system",
                    "content": spec_content.get("system_prompt")
                    or "You are a helpful assistant.",
                },
                {"role": "user", "content": prompt_text},
            ],
        }

        usage_final: Optional[Dict[str, Any]] = None
        full_text = ""
        chunk_count = 0
        step_count = 0
        run_start_time = datetime.now(timezone.utc)

        with httpx.Client(timeout=None) as client:
            with client.stream(
                "POST",
                f"{ROUTER_BASE_URL.rstrip('/')}/v1/chat/completions",
                json=payload,
                headers=headers,
            ) as resp:
                if resp.status_code >= 400:
                    body_preview = resp.read().decode("utf-8", errors="ignore")[:500]
                    raise RuntimeError(
                        f"Router returned {resp.status_code}: {body_preview}"
                    )

                for raw_line in resp.iter_lines():
                    if not raw_line:
                        continue

                    chunk_count += 1
                    if chunk_count % 20 == 0:
                        db.refresh(run)
                        if run.status == "cancelled":
                            _add_event(
                                db,
                                run.id,
                                "cancelled",
                                {
                                    "message": "Cancelled by user",
                                    "request_id": run.request_id,
                                },
                            )
                            return

                        # Job9C Day 6: Runaway protection check
                        current_time = datetime.now(timezone.utc)
                        within_limits, runaway_error = _check_runaway_protection(
                            agent, run, current_time
                        )
                        if not within_limits:
                            run.status = "error"
                            run.error_message = f"Run cancelled due to runaway protection: {runaway_error}"
                            db.add(run)
                            db.commit()
                            _add_event(
                                db,
                                run.id,
                                "error",
                                {
                                    "message": run.error_message,
                                    "request_id": run.request_id,
                                },
                            )
                            return

                        # Check max_steps limit
                        max_steps = getattr(agent, "max_steps_per_run", None)
                        if max_steps and max_steps > 0 and step_count > max_steps:
                            run.status = "error"
                            run.error_message = (
                                f"Run exceeded max steps: {step_count} > {max_steps}"
                            )
                            db.add(run)
                            db.commit()
                            _add_event(
                                db,
                                run.id,
                                "error",
                                {
                                    "message": run.error_message,
                                    "request_id": run.request_id,
                                },
                            )
                            return

                    line = _coerce_line_to_str(raw_line)
                    data_str = _parse_sse_data_line(line)
                    if data_str is None:
                        continue
                    if data_str == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data_str)
                    except Exception:
                        continue

                    # capture usage if router provides it
                    if isinstance(chunk.get("usage"), dict):
                        usage_final = chunk["usage"]

                    choices = chunk.get("choices") or []
                    if not choices:
                        continue

                    choice0 = choices[0] if isinstance(choices[0], dict) else {}
                    delta = choice0.get("delta") or {}

                    # tool call detection
                    tool_calls = delta.get("tool_calls")
                    function_call = delta.get("function_call")
                    role = delta.get("role")

                    # Job9C Day 6: Tool allowlist enforcement
                    if tool_calls:
                        tool_names = _extract_tool_names(tool_calls)
                        allowed, error_msg = _check_tool_allowlist(agent, tool_names)
                        if not allowed:
                            run.status = "error"
                            run.error_message = f"Tool allowlist violation: {error_msg}"
                            db.add(run)
                            db.commit()
                            _add_event(
                                db,
                                run.id,
                                "error",
                                {
                                    "message": run.error_message,
                                    "request_id": run.request_id,
                                },
                            )
                            return

                        step_count += 1
                        _add_event(
                            db,
                            run.id,
                            "tool_call",
                            {
                                "tool_call": {"tool_calls": tool_calls},
                                "request_id": run.request_id,
                            },
                        )
                    if function_call:
                        step_count += 1
                        _add_event(
                            db,
                            run.id,
                            "tool_call",
                            {
                                "tool_call": {"function_call": function_call},
                                "request_id": run.request_id,
                            },
                        )

                    # tool result (best-effort)
                    if role == "tool" and (delta.get("content") or delta.get("text")):
                        _add_event(
                            db,
                            run.id,
                            "tool_result",
                            {
                                "tool_result": {
                                    "content": delta.get("content") or delta.get("text")
                                },
                                "request_id": run.request_id,
                            },
                        )

                    # token content
                    text = delta.get("content") or ""
                    if text:
                        full_text += text
                        _add_event(
                            db,
                            run.id,
                            "token",
                            {"text": text, "request_id": run.request_id},
                        )

        # final cancellation check before committing status
        db.refresh(run)
        if run.status == "cancelled":
            _add_event(
                db,
                run.id,
                "cancelled",
                {"message": "Cancelled by user", "request_id": run.request_id},
            )
            return

        # finalize run
        run.status = "success"
        run.error_message = None
        run.latency_ms = (
            int((time.time() - run.created_at.timestamp()) * 1000)
            if getattr(run, "created_at", None)
            else None
        )

        # usage fallback if missing
        if not usage_final:
            approx_in = _approx_tokens(prompt_text)
            approx_out = _approx_tokens(full_text)
            usage_final = {
                "prompt_tokens": approx_in,
                "completion_tokens": approx_out,
                "total_tokens": approx_in + approx_out,
                "approx": True,
            }

        run.tokens_in = usage_final.get("prompt_tokens")
        run.tokens_out = usage_final.get("completion_tokens")
        run.tokens_total = usage_final.get("total_tokens")
        cost_usd, is_approx = estimate_cost_usd_with_fallback(model, usage_final or {})
        run.cost_estimate_usd = cost_usd
        run.cost_is_approximate = bool(is_approx)

        db.add(run)
        db.commit()

        upsert_daily_usage(
            db=db,
            user_id=run.user_id,
            tokens_total=run.tokens_total,
            cost_usd=run.cost_estimate_usd,
        )

        _add_event(
            db,
            run.id,
            "token",
            {"text": full_text, "is_final": True, "request_id": run.request_id},
        )
        _add_event(db, run.id, "done", {"ok": True, "request_id": run.request_id})

    except Exception as e:
        logger.exception("execute_run_via_router failed")
        try:
            run = db.query(RunModel).filter(RunModel.id == run_id).first()
            if run and run.status != "cancelled":
                run.status = "error"
                run.error_message = str(e)[:500]
                db.add(run)
                db.commit()
                _add_event(
                    db,
                    run.id,
                    "error",
                    {"message": run.error_message, "request_id": run.request_id},
                )
        except Exception:
            pass
    finally:
        db.close()
