import logging
import os
import time
from typing import Dict, List, Optional

import litellm
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .middleware.observability import ObservabilityMiddleware

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("zahara.router")


# ---------- Models ----------
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    provider: Optional[str] = None


# ---------- Config ----------
class RouterConfig:
    """Holds provider API keys and exposes helper methods."""

    def __init__(self) -> None:
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "")

        # Wire keys into LiteLLM env so model routing works
        if self.openai_api_key:
            os.environ["OPENAI_API_KEY"] = self.openai_api_key
        if self.anthropic_api_key:
            os.environ["ANTHROPIC_API_KEY"] = self.anthropic_api_key
        if self.openrouter_api_key:
            os.environ["OPENROUTER_API_KEY"] = self.openrouter_api_key

        logger.info(
            "RouterConfig initialized "
            f"(openai={bool(self.openai_api_key)} "
            f"anthropic={bool(self.anthropic_api_key)} "
            f"openrouter={bool(self.openrouter_api_key)})"
        )

    def provider_for_model(self, model: str) -> str:
        """Mirror API logic: pick provider by model hint.
        - 'gpt-*' -> openai
        - tinyllama/llama2/llama3/codellama -> openrouter (or local in API; here we use OpenRouter)
        - claude-* -> anthropic
        - otherwise -> openrouter
        """
        m = model.lower()
        if m.startswith("gpt-"):
            return "openai"
        if m.startswith("claude-"):
            return "anthropic"
        if any(
            x in m
            for x in [
                "tinyllama",
                "llama2",
                "llama-2",
                "llama3",
                "llama-3",
                "codellama",
            ]
        ):
            return "openrouter"
        return "openrouter"

    def has_provider_key(self, provider: str) -> bool:
        if provider == "openai":
            return bool(self.openai_api_key)
        if provider == "anthropic":
            return bool(self.anthropic_api_key)
        if provider == "openrouter":
            return bool(self.openrouter_api_key)
        return False

    def available_models(self) -> List[Dict[str, str]]:
        models: List[Dict[str, str]] = []
        if self.openai_api_key:
            models += [
                {"id": "gpt-4o-mini", "provider": "OpenAI"},
                {"id": "gpt-4o", "provider": "OpenAI"},
                {"id": "gpt-3.5-turbo", "provider": "OpenAI"},
            ]
        if self.anthropic_api_key:
            models += [
                {"id": "claude-3-haiku-20240307", "provider": "Anthropic"},
                {"id": "claude-3-sonnet-20240229", "provider": "Anthropic"},
                {"id": "claude-3-opus-20240229", "provider": "Anthropic"},
            ]
        if self.openrouter_api_key:
            models += [
                {"id": "openrouter/auto", "provider": "OpenRouter"},
                {"id": "meta-llama/llama-3.1-70b-instruct", "provider": "OpenRouter"},
                {"id": "google/gemini-flash-1.5", "provider": "OpenRouter"},
            ]
        return models


router_config = RouterConfig()

# Make LiteLLM a little chatty for debugging (logs to stdout)
litellm.set_verbose = True

# ---------- App ----------
app = FastAPI(
    title="Zahara V1 Router",
    version="1.0.0",
    description="OpenAI-compatible router that forwards /v1/chat/completions to the right provider.",
)
app.add_middleware(ObservabilityMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Health ----------
@app.get("/health")
async def health():
    return {"status": "healthy", "service": "router"}


# ---------- Models (OpenAI-compatible) ----------
@app.get("/v1/models")
async def list_models():
    models = router_config.available_models()
    if not models:
        raise HTTPException(
            status_code=501,
            detail="Not implemented: No API keys configured for any providers",
        )
    # OpenAI-compatible response shape
    return {
        "object": "list",
        "data": [{"id": m["id"], "object": "model"} for m in models],
    }


# ---------- Chat Completions (OpenAI-compatible) ----------
@app.post("/v1/chat/completions")
async def chat_completions(
    req: ChatCompletionRequest,
    x_provider_api_key: str | None = Header(default=None, alias="X-Provider-Api-Key"),
):
    """
    Central LLM router endpoint.

    - Supports per-user provider keys via X-Provider-Api-Key
    - Falls back to env-based provider keys if header is not present
    """

    start = time.time()

    # 1. Resolve provider
    provider = req.provider or router_config.provider_for_model(req.model)

    # 2. Resolve API key
    if x_provider_api_key:
        api_key = x_provider_api_key
    else:
        api_key = router_config.api_key_for_provider(provider)

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key available for provider '{provider}'",
        )

    try:
        response = litellm.completion(
            model=req.model,
            messages=req.messages,
            temperature=req.temperature,
            api_key=api_key,  # 🔑 key injection
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    latency_ms = int((time.time() - start) * 1000)

    # Normalize response (OpenAI-style)
    return {
        "id": response.get("id"),
        "model": response.get("model", req.model),
        "provider": provider,
        "choices": response.get("choices", []),
        "usage": response.get("usage", {}),
        "latency_ms": latency_ms,
    }
