from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models.agent import Agent as AgentModel
from ..models.agent_spec import AgentSpec as AgentSpecModel
from ..models.provider_key import ProviderKey as ProviderKeyModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..security.provider_keys_crypto import decrypt_secret
from ..services.audit import log_audit_event
from ..services.daily_usage import upsert_daily_usage
from ..services.pricing import estimate_cost_usd_with_fallback

logger = logging.getLogger("zahara.api.run_executor")


# Read at function call time so tests can override via env
def _router_base_url() -> Optional[str]:
    return os.getenv("LLM_ROUTER_URL")


# ── Demo execution constants ───────────────────────────────────────────────────

DEMO_SLUG_PREFIX = "demo-"

# Canned token streams keyed by agent slug prefix (matched with startswith)
_DEMO_RESPONSES: Dict[str, List[str]] = {
    "demo-zahara-assistant": [
        "I'd be happy to help with that! Here's what I found:\n\n",
        "**Analysis**\n\n",
        "Based on your request, there are several key points to consider. ",
        "First, let me break this down into manageable components:\n\n",
        "1. **Context & Background** — Understanding the full scope ",
        "helps ensure the response is accurate and actionable.\n\n",
        "2. **Core Insights** — The data suggests a clear pattern here. ",
        "The most important factor is consistency across all variables.\n\n",
        "3. **Recommendations** — Based on this analysis, I would suggest:\n",
        "   - Start with the highest-impact items first\n",
        "   - Validate assumptions early to avoid rework\n",
        "   - Document decisions for future reference\n\n",
        "4. **Next Steps** — To move forward effectively:\n",
        "   - Review the findings with your team\n",
        "   - Prioritise based on effort vs. impact\n",
        "   - Set measurable success criteria\n\n",
        "Is there a specific aspect you'd like me to explore further? ",
        "I can dive deeper into any of the points above. \u2728",
    ],
    "demo-code-reviewer": [
        "I've reviewed the code. Here are my findings:\n\n",
        "**\U0001f534 Critical Issues (fix before merge)**\n\n",
        "- **Null pointer risk**: `data` may be `None` on line 14 — ",
        "add a guard before accessing `.items()`.\n",
        "- **Race condition**: the shared counter is modified without a lock ",
        "in the concurrent path.\n\n",
        "**\U0001f7e1 Performance**\n\n",
        "- O(n\u00b2) nested loop on lines 22–31 — replace with a lookup dict.\n",
        "- Unnecessary list copy via `list()` on line 18 — iterate directly.\n\n",
        "**\U0001f535 Style**\n\n",
        "- Missing type hints throughout. Suggest: `def process(items: list[str]) -> dict`\n",
        "- Long function (47 lines) — split at the natural boundary on line 28.\n\n",
        "**\u2705 What's good**\n\n",
        "- Error handling in the `except` block is clean.\n",
        "- Variable names are clear and descriptive.\n\n",
        "Fix the critical issues and this is good to merge. \U0001f44d",
    ],
}

# Fallback response for demo agents whose slug doesn't match above
_DEMO_FALLBACK: List[str] = [
    "Thanks for your message! I'm a demo AI agent running in simulation mode.\n\n",
    "This is a **live demo** of Zahara's streaming response system. ",
    "In production, this would connect to a real LLM provider.\n\n",
    "**What you're seeing**:\n",
    "- Real-time token streaming from the backend\n",
    "- SSE (Server-Sent Events) delivery to the browser\n",
    "- Proper run lifecycle tracking (start \u2192 stream \u2192 done)\n\n",
    "To enable real LLM responses, add a provider key in the **Provider Keys** page ",
    "and point `LLM_ROUTER_URL` at a running LiteLLM instance.\n\n",
    "Feel free to try the Vibe, Flow, and Pro builder modes! \U0001f680",
]

_DEMO_TOKEN_DELAY = 0.055  # seconds between each token chunk (~18 chunks/sec)
_DEMO_MODEL = "gpt-4o-mini"
_DEMO_PROVIDER = "openai"


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


def _add_event(
    db: Session,
    run_id: str,
    type_: str,
    payload: Dict[str, Any],
) -> None:
    """Insert a RunEvent with an auto-incremented seq number.

    The uq_run_events_run_id_seq constraint requires (run_id, seq) to be
    unique. SQLAlchemy's column default of 0 means every event without an
    explicit seq collides. We compute the next seq via MAX(seq)+1 so this
    is safe even across concurrent writers (each commit is visible before
    the next call because we commit immediately after each add).
    """
    from sqlalchemy import func as sa_func

    max_seq = (
        db.query(sa_func.max(RunEventModel.seq))
        .filter(RunEventModel.run_id == run_id)
        .scalar()
    )
    next_seq = (max_seq + 1) if max_seq is not None else 0
    db.add(RunEventModel(run_id=run_id, type=type_, payload=payload, seq=next_seq))
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


def _is_demo_agent(agent: AgentModel, spec_content: Dict[str, Any]) -> bool:
    """
    True when the run should use the canned demo executor instead of a real LLM.
    Triggers on:
      - agent slug starting with "demo-"
      - spec content flag   { "demo_mode": true }
    """
    if agent.slug and agent.slug.startswith(DEMO_SLUG_PREFIX):
        return True
    if spec_content.get("demo_mode") is True:
        return True
    return False


def _pick_demo_tokens(agent: AgentModel) -> List[str]:
    """Return the right canned token stream for this demo agent."""
    slug = agent.slug or ""
    for key, tokens in _DEMO_RESPONSES.items():
        if slug.startswith(key) or key in slug:
            return tokens
    return _DEMO_FALLBACK


def _execute_demo_run(db: Session, run: RunModel, agent: AgentModel) -> None:
    """
    Simulate a realistic streaming LLM run without hitting any external service.

    Flow:
      1. Mark run as running
      2. Emit system/run_started
      3. Stream token chunks with small delays (checks cancellation every 5 chunks)
      4. Emit done with realistic metrics
      5. Mark run as success
    """
    t0 = time.time()

    run.status = "running"
    run.model = _DEMO_MODEL
    run.provider = _DEMO_PROVIDER
    run.updated_at = datetime.now(timezone.utc)
    db.add(run)
    db.commit()

    _add_event(
        db,
        run.id,
        "system",
        {
            "message": "run_started",
            "model": _DEMO_MODEL,
            "provider": _DEMO_PROVIDER,
            "request_id": run.request_id,
            "demo_mode": True,
        },
    )

    token_chunks = _pick_demo_tokens(agent)
    full_text = ""

    for i, chunk in enumerate(token_chunks):
        # Check for cancellation every 5 chunks
        if i % 5 == 0:
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

        time.sleep(_DEMO_TOKEN_DELAY)
        full_text += chunk
        _add_event(
            db,
            run.id,
            "token",
            {
                "text": chunk,
                "request_id": run.request_id,
            },
        )

    # Final cancellation check before committing success
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

    latency_ms = int((time.time() - t0) * 1000)
    tokens_in = _approx_tokens(run.input or "")
    tokens_out = _approx_tokens(full_text)
    cost_usd, is_approx = estimate_cost_usd_with_fallback(
        _DEMO_MODEL,
        {
            "prompt_tokens": tokens_in,
            "completion_tokens": tokens_out,
            "total_tokens": tokens_in + tokens_out,
        },
    )

    run.status = "success"
    run.error_message = None
    run.latency_ms = latency_ms
    run.tokens_in = tokens_in
    run.tokens_out = tokens_out
    run.tokens_total = tokens_in + tokens_out
    run.cost_estimate_usd = cost_usd
    run.cost_is_approximate = bool(is_approx)
    db.add(run)
    db.commit()

    try:
        upsert_daily_usage(
            db=db,
            user_id=run.user_id,
            tokens_total=run.tokens_total,
            cost_usd=run.cost_estimate_usd,
        )
    except Exception:
        pass

    _add_event(
        db,
        run.id,
        "done",
        {
            "ok": True,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "tokens_total": tokens_in + tokens_out,
            "cost_estimate_usd": cost_usd,
            "cost_is_approximate": bool(is_approx),
            "latency_ms": latency_ms,
            "request_id": run.request_id,
        },
    )


def execute_run_via_router(run_id: str) -> None:
    """
    Streaming run execution:
    - reads router SSE
    - emits token/log/tool_call/tool_result events
    - writes final run tokens/cost (fallback if missing usage)
    - respects cancellation (status=cancelled)
    - demo agents bypass the LLM router entirely
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

        # ── TASK-B2: Demo mode — bypass LLM router entirely ───────────────────
        if _is_demo_agent(agent, spec_content):
            _execute_demo_run(db, run, agent)
            return
        # ─────────────────────────────────────────────────────────────────────

        router_url = _router_base_url()
        if not router_url:
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
                f"{router_url.rstrip('/')}/v1/chat/completions",
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
                            run.status = "cancelled"
                            run.error_message = f"Run cancelled due to runaway protection: {runaway_error}"
                            db.add(run)
                            db.commit()
                            _add_event(
                                db,
                                run.id,
                                "cancelled",
                                {
                                    "message": run.error_message,
                                    "request_id": run.request_id,
                                },
                            )
                            if run.user_id:
                                log_audit_event(
                                    db,
                                    user_id=run.user_id,
                                    event_type="runaway.stopped",
                                    entity_type="run",
                                    entity_id=run.id,
                                    payload={
                                        "agent_id": run.agent_id,
                                        "reason": runaway_error,
                                    },
                                )
                            return

                        # Check max_steps limit
                        max_steps = getattr(agent, "max_steps_per_run", None)
                        if max_steps and max_steps > 0 and step_count > max_steps:
                            run.status = "cancelled"
                            run.error_message = (
                                f"Run exceeded max steps: {step_count} > {max_steps}"
                            )
                            db.add(run)
                            db.commit()
                            _add_event(
                                db,
                                run.id,
                                "cancelled",
                                {
                                    "message": run.error_message,
                                    "request_id": run.request_id,
                                },
                            )
                            if run.user_id:
                                log_audit_event(
                                    db,
                                    user_id=run.user_id,
                                    event_type="runaway.stopped",
                                    entity_type="run",
                                    entity_id=run.id,
                                    payload={
                                        "agent_id": run.agent_id,
                                        "reason": run.error_message,
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
                            if run.user_id:
                                log_audit_event(
                                    db,
                                    user_id=run.user_id,
                                    event_type="tool.blocked",
                                    entity_type="run",
                                    entity_id=run.id,
                                    payload={
                                        "agent_id": run.agent_id,
                                        "blocked_tools": tool_names,
                                        "reason": error_msg,
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
        _add_event(
            db,
            run.id,
            "done",
            {
                "ok": True,
                "tokens_in": run.tokens_in,
                "tokens_out": run.tokens_out,
                "tokens_total": run.tokens_total,
                "cost_estimate_usd": run.cost_estimate_usd,
                "cost_is_approximate": run.cost_is_approximate,
                "latency_ms": run.latency_ms,
                "request_id": run.request_id,
            },
        )

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
