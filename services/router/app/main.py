import logging
import os
from typing import List, Optional

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Zahara.ai Router Service",
    version="1.0.0",
    description="Zahara.ai - Intelligent LLM Router and Load Balancer",
    debug=True,
    contact={
        "name": "Zahara.ai",
        "url": "https://zahara.ai",
    },
    license_info={
        "name": "MIT License",
        "url": "https://github.com/zahara-ai/zahara-v1/blob/main/LICENSE",
    },
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Zahara.ai Router Service",
        "company": "Zahara.ai",
        "version": "1.0.0",
        "status": "running",
        "website": "https://zahara.ai"
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Zahara.ai Router",
        "company": "Zahara.ai",
        "version": "1.0.0"
    }

# Pydantic models for chat completions
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False

class RouterConfig:
    """Configuration for LLM provider routing"""
    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")

        logger.info("RouterConfig initialized:")
        logger.info(f"  OpenAI key present: {bool(self.openai_api_key)}")
        logger.info(f"  Anthropic key present: {bool(self.anthropic_api_key)}")
        logger.info(f"  OpenRouter key present: {bool(self.openrouter_api_key)}")

    def has_provider_key(self, model: str) -> tuple[bool, str]:
        """Check if we have API keys for the requested model"""
        model_lower = model.lower()

        # OpenAI models
        if any(provider in model_lower for provider in ['gpt', 'openai']):
            return bool(self.openai_api_key), "OpenAI"

        # Anthropic models
        elif any(provider in model_lower for provider in ['claude', 'anthropic']):
            return bool(self.anthropic_api_key), "Anthropic"

        # OpenRouter models (fallback for many providers)
        elif self.openrouter_api_key:
            return True, "OpenRouter"

        return False, "Unknown"

router_config = RouterConfig()

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """OpenAI-compatible chat completions endpoint with provider routing"""
    logger.info(f"Received chat completion request for model: {request.model}")
    logger.info(f"Request messages: {request.messages}")

    # Check if we have API keys for the requested model
    has_key, provider = router_config.has_provider_key(request.model)

    if not has_key:
        raise HTTPException(
            status_code=501,
            detail=f"Not implemented: No {provider} API keys configured for model '{request.model}'"
        )

    # Route to appropriate provider
    try:
        if provider == "OpenAI":
            return await route_to_openai(request)
        elif provider == "Anthropic":
            return await route_to_anthropic(request)
        elif provider == "OpenRouter":
            return await route_to_openrouter(request)
        else:
            raise HTTPException(
                status_code=501,
                detail=f"Provider {provider} not yet implemented"
            )
    except Exception as e:
        import traceback
        error_details = f"Provider error: {str(e)}\nTraceback: {traceback.format_exc()}"
        logger.error(f"ERROR in chat_completions: {error_details}")
        raise HTTPException(
            status_code=502,
            detail=f"Provider error: {str(e)}"
        )

async def route_to_openai(request: ChatCompletionRequest):
    """Route request to OpenAI API"""
    logger.info(f"Routing to OpenAI for model: {request.model}")
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {
            "Authorization": f"Bearer {router_config.openai_api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": request.model,
            "messages": [{"role": msg.role, "content": msg.content} for msg in request.messages],
            "temperature": request.temperature,
        }

        if request.max_tokens:
            payload["max_tokens"] = request.max_tokens

        try:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload
            )

            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            # Re-raise with more context
            error_msg = f"OpenAI API error: {e.response.text}"
            logger.error(f"ERROR in route_to_openai (HTTP): {error_msg}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=error_msg
            )
        except httpx.RequestError as e:
            error_msg = f"Network error connecting to OpenAI: {str(e)}"
            logger.error(f"ERROR in route_to_openai (Network): {error_msg}")
            raise HTTPException(
                status_code=502,
                detail=error_msg
            )
        except Exception as e:
            error_msg = f"Unexpected error in OpenAI routing: {str(e)}"
            logger.error(f"ERROR in route_to_openai (Unexpected): {error_msg}")
            raise HTTPException(
                status_code=502,
                detail=error_msg
            )

async def route_to_anthropic(request: ChatCompletionRequest):
    """Route request to Anthropic API"""
    # Convert messages to Anthropic format
    system_msg = ""
    messages = []

    for msg in request.messages:
        if msg.role == "system":
            system_msg = msg.content
        else:
            messages.append({"role": msg.role, "content": msg.content})

    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {
            "x-api-key": router_config.anthropic_api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }

        payload = {
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens or 1024,
        }

        if system_msg:
            payload["system"] = system_msg

        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload
        )

        response.raise_for_status()
        return response.json()

async def route_to_openrouter(request: ChatCompletionRequest):
    """Route request to OpenRouter API"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {
            "Authorization": f"Bearer {router_config.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://zahara.ai",
            "X-Title": "Zahara.ai"
        }

        payload = {
            "model": request.model,
            "messages": [{"role": msg.role, "content": msg.content} for msg in request.messages],
            "temperature": request.temperature,
        }

        if request.max_tokens:
            payload["max_tokens"] = request.max_tokens

        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload
        )

        response.raise_for_status()
        return response.json()

@app.get("/v1/models")
async def list_models():
    """List available models based on configured API keys"""
    available_models = []

    if router_config.openai_api_key:
        available_models.extend([
            {"id": "gpt-3.5-turbo", "provider": "OpenAI"},
            {"id": "gpt-4", "provider": "OpenAI"},
            {"id": "gpt-4-turbo", "provider": "OpenAI"}
        ])

    if router_config.anthropic_api_key:
        available_models.extend([
            {"id": "claude-3-sonnet-20240229", "provider": "Anthropic"},
            {"id": "claude-3-haiku-20240307", "provider": "Anthropic"}
        ])

    if router_config.openrouter_api_key:
        available_models.extend([
            {"id": "openai/gpt-3.5-turbo", "provider": "OpenRouter"},
            {"id": "anthropic/claude-3-sonnet", "provider": "OpenRouter"},
            {"id": "meta-llama/llama-2-70b-chat", "provider": "OpenRouter"}
        ])

    return {
        "object": "list",
        "data": available_models
    }

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=7000, reload=True)

