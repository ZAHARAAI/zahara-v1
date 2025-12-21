from __future__ import annotations

from typing import Any, AsyncIterator, Dict, List, Optional

from ..config import settings
from ..llm.router_client import (
    chat_completions,
    stream_chat_completions,
)
from ..llm.router_client import (
    health_check as router_health_check,
)


class LLMService:
    """
    Job6 Central Router Ownership (Enforced)

    IMPORTANT:
      - This API service must NOT call OpenAI/Anthropic/Ollama directly.
      - All LLM requests go through zahara-v1-router (LLM_ROUTER_URL).
      - Provider selection (openai/anthropic/etc.) happens inside the router.

    This class is kept as a stable interface for any legacy endpoints that still import LLMService.
    """

    def __init__(self) -> None:
        # Keep these for backward compatibility, but DO NOT use them for direct provider calls.
        self.default_model: str = settings.default_model

        # Legacy fields retained so other modules don’t crash if they reference them.
        # (Do not use in API code for direct provider access.)
        self.local_llm_url = None
        self.openai_api_key = None
        self.openrouter_api_key = None

        self.default_provider = "router"

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Non-streaming chat completion (router-only).
        `provider` is forwarded to router as a hint; router decides final routing.
        """
        payload: Dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
            # pass provider hint if present (router normalizes/accepts it)
            "provider": (provider or None),
            "temperature": 0.7,
            "stream": False,
        }

        try:
            data = await chat_completions(payload)
            # Normalize into your existing return style expected by /llm/chat
            content = ""
            try:
                content = data["choices"][0]["message"]["content"]
            except Exception:
                content = ""

            return {
                "provider": "router",
                "model": payload["model"],
                "message": content,
                "raw": data,
                "usage": data.get("usage", {}),
            }
        except Exception as e:
            return {"error": f"Router error: {e}"}

    async def chat_completion_stream(
        self,
        messages: List[Dict[str, Any]],
        model: Optional[str] = None,
        provider: Optional[str] = None,
        temperature: float = 0.7,
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Streaming chat completion (router-only).
        Yields router chunk JSON objects as they arrive.
        """
        payload: Dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
            "provider": (provider or None),
            "temperature": temperature,
            "stream": True,
        }

        async for chunk in stream_chat_completions(payload):
            yield chunk

    # ---- Legacy helpers (keep endpoints from breaking) ----

    async def generate_text(
        self,
        prompt: str,
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Legacy endpoint compatibility: converts a prompt into chat messages.
        """
        messages = [{"role": "user", "content": prompt}]
        return await self.chat_completion(
            messages=messages, model=model, provider=provider
        )

    async def get_available_models(self, provider: str = "router") -> Dict[str, Any]:
        """
        Router does not currently expose a models endpoint.
        Return a minimal, safe response.
        """
        return {
            "provider": "router",
            "models": [self.default_model],
            "note": "Model catalog is managed by zahara-v1-router. Set DEFAULT_MODEL/DEFAULT_PROVIDER on router.",
        }

    async def health_check(self) -> Dict[str, Any]:
        """
        Router-only health check (no token spend).
        """
        return await router_health_check()
