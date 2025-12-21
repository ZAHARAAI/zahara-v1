from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator, Dict, Optional

import httpx

LLM_ROUTER_URL = os.getenv("LLM_ROUTER_URL")
LLM_ROUTER_TIMEOUT_S = float(os.getenv("LLM_ROUTER_TIMEOUT_S", "30"))


class LLMRouterError(RuntimeError):
    pass


def _assert_router_configured() -> None:
    if not LLM_ROUTER_URL:
        raise LLMRouterError(
            "LLM_ROUTER_URL is not set. "
            "Central router ownership requires all LLM calls to go through zahara-v1-router."
        )


def _router_headers(extra_headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    # Preserve upstream request-id if caller passes it in
    h = {"Content-Type": "application/json"}
    if extra_headers:
        h.update(extra_headers)
    return h


async def chat_completions(
    payload: Dict[str, Any], *, headers: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Non-streaming OpenAI-compatible chat completion via router.
    """
    _assert_router_configured()
    url = f"{LLM_ROUTER_URL}/v1/chat/completions"
    timeout = httpx.Timeout(LLM_ROUTER_TIMEOUT_S, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            url, json={**payload, "stream": False}, headers=_router_headers(headers)
        )
        if r.status_code >= 400:
            raise LLMRouterError(f"Router error {r.status_code}: {r.text[:800]}")
        return r.json()


async def stream_chat_completions(
    payload: Dict[str, Any], *, headers: Optional[Dict[str, str]] = None
) -> AsyncIterator[Dict[str, Any]]:
    """
    Streaming OpenAI-compatible chat completion via router.
    Yields decoded JSON objects from router SSE `data: {...}` frames.
    """
    _assert_router_configured()
    url = f"{LLM_ROUTER_URL}/v1/chat/completions"
    timeout = httpx.Timeout(LLM_ROUTER_TIMEOUT_S, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            url,
            json={**payload, "stream": True},
            headers=_router_headers(headers),
        ) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise LLMRouterError(f"Router error {resp.status_code}: {body[:800]!r}")

            async for line in resp.aiter_lines():
                if not line:
                    continue
                if not line.startswith("data: "):
                    continue

                data = line[6:].strip()
                if data == "[DONE]":
                    return

                try:
                    yield json.loads(data)
                except Exception:
                    # Ignore malformed frames safely
                    continue


async def health_check() -> Dict[str, Any]:
    """
    Cheap router health check with no token spend.
    We probe router's OpenAPI doc endpoint.
    """
    if not LLM_ROUTER_URL:
        return {
            "status": "unavailable",
            "provider": "router",
            "error": "LLM_ROUTER_URL not set",
        }

    timeout = httpx.Timeout(5.0, connect=3.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(f"{LLM_ROUTER_URL}/openapi.json")
        if r.status_code == 200:
            return {"status": "healthy", "provider": "router"}
        return {
            "status": "unhealthy",
            "provider": "router",
            "error": f"HTTP {r.status_code}",
        }
    except Exception as e:
        return {"status": "unhealthy", "provider": "router", "error": str(e)}
