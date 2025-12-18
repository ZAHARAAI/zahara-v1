from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, Generator, Optional, Tuple

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger("zahara.router")

# LiteLLM is the intended router layer in this repo.
# It supports streaming when stream=True.
try:
    import litellm  # type: ignore
except Exception:  # pragma: no cover
    litellm = None  # type: ignore

app = FastAPI(title="zahara-v1-router")


DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gpt-4o-mini")
DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "openai")
ROUTER_TIMEOUT_S = float(os.getenv("ROUTER_TIMEOUT_S", "60"))
ROUTER_MAX_RETRIES = int(os.getenv("ROUTER_MAX_RETRIES", "2"))


def _now_ms() -> int:
    return int(time.time() * 1000)


def _get_request_id(request: Request) -> str:
    # Prefer upstream request id for end-to-end tracing
    return (
        request.headers.get("x-request-id")
        or request.headers.get("X-Request-Id")
        or request.headers.get("x_request_id")
        or f"req_{_now_ms()}"
    )


def _normalize_provider(p: Optional[str]) -> str:
    p = (p or DEFAULT_PROVIDER).strip().lower()
    # Normalize common aliases
    aliases = {
        "openai": "openai",
        "anthropic": "anthropic",
        "google": "gemini",
        "gemini": "gemini",
        "azure": "azure",
        "azureopenai": "azure",
        "mistral": "mistral",
        "groq": "groq",
        "together": "together_ai",
        "together_ai": "together_ai",
    }
    return aliases.get(p, p)


def _safe_log(event: str, **fields: Any) -> None:
    # Keep logs JSON-ish and avoid leaking secrets
    payload = {"event": event, **fields}
    try:
        logger.info(json.dumps(payload, ensure_ascii=False))
    except Exception:  # pragma: no cover
        logger.info("%s %s", event, payload)


def _extract_usage(resp: Any) -> Dict[str, Any]:
    # LiteLLM may return dict or pydantic-like object
    if resp is None:
        return {}
    if isinstance(resp, dict):
        return resp.get("usage") or {}
    # pydantic v2
    usage = getattr(resp, "usage", None)
    if usage is None:
        return {}
    if isinstance(usage, dict):
        return usage
    # usage object
    try:
        return usage.model_dump()  # type: ignore[attr-defined]
    except Exception:
        return {}


def _completion_once(
    *,
    model: str,
    provider: str,
    messages: list,
    temperature: float,
    api_key: Optional[str],
    timeout_s: float,
) -> Any:
    if litellm is None:
        raise HTTPException(status_code=500, detail="litellm_not_available")

    # LiteLLM supports provider routing via model strings in some setups,
    # but we keep provider explicit for clarity.
    return litellm.completion(
        model=model,
        messages=messages,
        temperature=temperature,
        stream=False,
        api_key=api_key,
        provider=provider,
        timeout=timeout_s,
    )


def _completion_stream_once(
    *,
    model: str,
    provider: str,
    messages: list,
    temperature: float,
    api_key: Optional[str],
    timeout_s: float,
) -> Any:
    if litellm is None:
        raise HTTPException(status_code=500, detail="litellm_not_available")

    return litellm.completion(
        model=model,
        messages=messages,
        temperature=temperature,
        stream=True,
        api_key=api_key,
        provider=provider,
        timeout=timeout_s,
    )


def _with_retries(fn, *, max_retries: int) -> Tuple[Any, int]:
    """Return (result, attempts). Retries on transient exceptions."""
    attempts = 0
    last_exc: Optional[Exception] = None
    for i in range(max_retries + 1):
        attempts = i + 1
        try:
            return fn(), attempts
        except Exception as e:  # noqa: BLE001
            last_exc = e
            # Very small backoff; keep router responsive
            time.sleep(min(0.25 * (i + 1), 1.0))
    assert last_exc is not None
    raise last_exc


def _completion_stream(
    *,
    request_id: str,
    model: str,
    provider: str,
    messages: list,
    temperature: float,
    api_key: Optional[str],
    timeout_s: float,
    max_retries: int,
) -> Generator[bytes, None, None]:
    """
    OpenAI-style SSE response:
      data: {json}\n\n
    Terminal:
      data: [DONE]\n\n
    """
    t0 = _now_ms()

    def _start_stream():
        return _completion_stream_once(
            model=model,
            provider=provider,
            messages=messages,
            temperature=temperature,
            api_key=api_key,
            timeout_s=timeout_s,
        )

    # For streaming, we only retry if the stream fails before yielding any chunk.
    stream = None
    attempts = 0
    yielded_any = False
    last_err: Optional[str] = None
    for i in range(max_retries + 1):
        attempts = i + 1
        try:
            stream = _start_stream()
            for chunk in stream:
                if not chunk:
                    continue
                yielded_any = True
                payload = chunk if isinstance(chunk, dict) else chunk.model_dump()  # type: ignore
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode(
                    "utf-8"
                )
            last_err = None
            break
        except Exception as e:  # noqa: BLE001
            last_err = str(e)
            if yielded_any:
                # Can't safely restart mid-stream
                break
            time.sleep(min(0.25 * (i + 1), 1.0))

    if last_err:
        # Emit an error chunk in-stream so callers can record it
        err_payload = {
            "id": request_id,
            "object": "error",
            "created": int(time.time()),
            "model": model,
            "error": {"message": last_err, "type": "router_error"},
        }
        yield f"data: {json.dumps(err_payload, ensure_ascii=False)}\n\n".encode("utf-8")

    yield b"data: [DONE]\n\n"
    _safe_log(
        "router_stream_done",
        request_id=request_id,
        model=model,
        provider=provider,
        latency_ms=_now_ms() - t0,
        attempts=attempts,
        yielded_any=yielded_any,
        error=last_err,
    )


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """
    A small router facade compatible with OpenAI chat completions.
    BYOK keys are forwarded from API -> Router via Authorization header.
    """
    request_id = _get_request_id(request)
    body = await request.json()

    model = (body.get("model") or DEFAULT_MODEL).strip()
    messages = body.get("messages") or []
    temperature = float(body.get("temperature", 0.2))
    stream = bool(body.get("stream", False))
    provider = _normalize_provider(body.get("provider"))

    # Optional per-request overrides
    timeout_s = float(body.get("timeout_s", ROUTER_TIMEOUT_S))
    max_retries = int(body.get("max_retries", ROUTER_MAX_RETRIES))

    auth = (
        request.headers.get("authorization")
        or request.headers.get("Authorization")
        or ""
    )
    api_key = None
    if auth.lower().startswith("bearer "):
        api_key = auth.split(" ", 1)[1].strip()

    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=400, detail={"error": "messages_required"})

    t0 = _now_ms()
    _safe_log(
        "router_request",
        request_id=request_id,
        model=model,
        provider=provider,
        stream=stream,
    )

    try:
        if stream:
            resp = StreamingResponse(
                _completion_stream(
                    request_id=request_id,
                    model=model,
                    provider=provider,
                    messages=messages,
                    temperature=temperature,
                    api_key=api_key,
                    timeout_s=timeout_s,
                    max_retries=max_retries,
                ),
                media_type="text/event-stream",
                headers={
                    "X-Request-Id": request_id,
                    "X-Router-Latency-Ms": str(_now_ms() - t0),
                },
            )
            return resp

        def _call():
            return _completion_once(
                model=model,
                provider=provider,
                messages=messages,
                temperature=temperature,
                api_key=api_key,
                timeout_s=timeout_s,
            )

        resp_obj, attempts = _with_retries(_call, max_retries=max_retries)
        resp_dict = resp_obj if isinstance(resp_obj, dict) else resp_obj.model_dump()  # type: ignore

        usage = _extract_usage(resp_obj)
        latency_ms = _now_ms() - t0
        _safe_log(
            "router_response",
            request_id=request_id,
            model=model,
            provider=provider,
            latency_ms=latency_ms,
            attempts=attempts,
            usage=usage or None,
        )

        return JSONResponse(
            resp_dict,
            headers={
                "X-Request-Id": request_id,
                "X-Router-Latency-Ms": str(latency_ms),
            },
        )

    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        latency_ms = _now_ms() - t0
        _safe_log(
            "router_error",
            request_id=request_id,
            model=model,
            provider=provider,
            latency_ms=latency_ms,
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "router_error",
                "message": str(e),
                "latency_ms": latency_ms,
                "request_id": request_id,
            },
        )
