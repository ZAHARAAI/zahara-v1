from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, Generator, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger("zahara.router")

# LiteLLM is the intended router layer in this repo.
# It supports streaming when stream=True.
try:
    import litellm  # type: ignore
except Exception as e:
    litellm = None  # type: ignore
    logger.error("LiteLLM not available: %s", e)

app = FastAPI(title="zahara-v1-router")

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gpt-4.1-mini")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/v1/models")
def list_models() -> dict:
    # Keep it simple; upstream provider list is dynamic.
    return {"object": "list", "data": [{"id": DEFAULT_MODEL, "object": "model"}]}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _normalize_provider(provider: Optional[str]) -> str:
    return (provider or "openai").strip().lower()


def _completion_nonstream(
    *,
    model: str,
    provider: str,
    messages: list,
    temperature: float,
    api_key: Optional[str],
) -> Dict[str, Any]:
    if litellm is None:
        raise HTTPException(status_code=500, detail="litellm_not_available")

    # LiteLLM expects model names like "openai/gpt-4.1-mini" sometimes depending on setup.
    # If your litellm config uses provider routing, keep as-is.
    # We pass api_key explicitly to ensure BYOK works.
    resp = litellm.completion(
        model=model,
        messages=messages,
        temperature=temperature,
        api_key=api_key,
    )
    # Ensure it's JSON-serializable
    return resp if isinstance(resp, dict) else resp.model_dump()  # type: ignore


def _completion_stream(
    *,
    model: str,
    provider: str,
    messages: list,
    temperature: float,
    api_key: Optional[str],
) -> Generator[bytes, None, None]:
    """
    OpenAI-style SSE response:
      data: {json}\n\n
    Terminal:
      data: [DONE]\n\n
    """
    if litellm is None:
        raise HTTPException(status_code=500, detail="litellm_not_available")

    # Streaming generator from LiteLLM
    stream = litellm.completion(
        model=model,
        messages=messages,
        temperature=temperature,
        api_key=api_key,
        stream=True,
    )

    # LiteLLM yields chunks that are dict-like or pydantic-like
    for chunk in stream:
        if not chunk:
            continue
        if isinstance(chunk, dict):
            payload = chunk
        else:
            payload = chunk.model_dump()  # type: ignore
        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")

    yield b"data: [DONE]\n\n"


@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Any:
    """
    OpenAI-compatible endpoint.

    - Accepts `stream: true` and returns SSE chunks when streaming.
    - Auth: BYOK keys are forwarded from API -> Router via Authorization header.
    """
    body = await request.json()
    model = (body.get("model") or DEFAULT_MODEL).strip()
    messages = body.get("messages") or []
    temperature = float(body.get("temperature", 0.2))
    stream = bool(body.get("stream", False))
    provider = _normalize_provider(body.get("provider"))

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
    try:
        if stream:
            return StreamingResponse(
                _completion_stream(
                    model=model,
                    provider=provider,
                    messages=messages,
                    temperature=temperature,
                    api_key=api_key,
                ),
                media_type="text/event-stream",
            )

        resp = _completion_nonstream(
            model=model,
            provider=provider,
            messages=messages,
            temperature=temperature,
            api_key=api_key,
        )
        return JSONResponse(resp)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("router_error: %s", e)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "router_error",
                "message": str(e),
                "latency_ms": _now_ms() - t0,
            },
        )
