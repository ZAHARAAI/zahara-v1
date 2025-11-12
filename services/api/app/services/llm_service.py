# add near the top with imports
import httpx
import openai

from ..config import settings


class LLMService:
    def __init__(self):
        self.local_llm_url = settings.local_llm_url  # None if OLLAMA_HOST is unset
        self.openai_api_key = (
            settings.openai_api_key.get_secret_value()
            if settings.openai_api_key
            else None
        )
        self.default_model = settings.default_model

        # Pick default provider:
        # - If no local_llm_url -> default to OpenAI (when key exists)
        # - Else if local_llm_url exists -> prefer Ollama
        if self.local_llm_url:
            self.default_provider = "ollama"
        elif self.openai_api_key:
            self.default_provider = "openai"
        else:
            self.default_provider = "unconfigured"

        # Configure OpenAI client lazily when used
        if self.openai_api_key:
            openai.api_key = self.openai_api_key

    async def chat_completion(
        self,
        messages: list[dict],
        model: str | None = None,
        provider: str | None = None,
    ):
        provider = provider or self.default_provider
        model = model or self.default_model

        if provider == "openai":
            if not self.openai_api_key:
                return {"error": "OPENAI_API_KEY not configured"}
            # Minimal OpenAI-compatible call
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        "https://api.openai.com/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.openai_api_key}",
                            "Content-Type": "application/json",
                        },
                        json={"model": model, "messages": messages},
                    )
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "provider": "openai",
                        "model": model,
                        "message": data["choices"][0]["message"]["content"],
                        "usage": data.get("usage", {}),
                    }
                return {"error": f"OpenAI {resp.status_code}: {resp.text}"}
            except Exception as e:
                return {"error": f"OpenAI error: {e}"}

        elif provider == "ollama":
            if not self.local_llm_url:
                return {"error": "OLLAMA_HOST (local_llm_url) not configured"}
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        f"{self.local_llm_url}/v1/chat/completions",
                        headers={"Content-Type": "application/json"},
                        json={"model": model, "messages": messages},
                    )
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "provider": "ollama",
                        "model": model,
                        "message": data["choices"][0]["message"]["content"],
                        "usage": data.get("usage", {}),
                    }
                return {"error": f"Ollama {resp.status_code}: {resp.text}"}
            except Exception as e:
                return {"error": f"Ollama error: {e}"}

        # Fallback when nothing configured
        return {
            "error": "No LLM provider configured (set OPENAI_API_KEY or OLLAMA_HOST)"
        }

    async def health_check(self) -> dict:
        """
        Return {"status": ..., "provider": "..."}.
        Healthy if either:
          - OpenAI is configured and reachable, or
          - Ollama is reachable at local_llm_url
        """
        # Prefer reporting OpenAI as healthy if configured
        if self.openai_api_key:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    # lightweight call; listing models is cheap and doesn't spend tokens
                    r = await client.get(
                        "https://api.openai.com/v1/models",
                        headers={"Authorization": f"Bearer {self.openai_api_key}"},
                    )
                if r.status_code == 200:
                    return {"status": "healthy", "provider": "openai"}
                else:
                    # fall through to check ollama if present
                    openai_err = f"OpenAI status {r.status_code}"
            except Exception as e:
                openai_err = f"OpenAI error: {e}"
        else:
            openai_err = "OPENAI_API_KEY not set"

        # Check Ollama if configured
        if self.local_llm_url:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    rr = await client.get(f"{self.local_llm_url}/api/tags")
                if rr.status_code == 200:
                    return {"status": "healthy", "provider": "ollama"}
                return {
                    "status": "unhealthy",
                    "provider": "ollama",
                    "error": f"Ollama status {rr.status_code}",
                }
            except Exception as e:
                return {
                    "status": "unhealthy",
                    "provider": "ollama",
                    "error": f"Ollama error: {e}",
                }

        # Neither is healthy/configured
        return {"status": "unavailable", "provider": "none", "error": openai_err}
