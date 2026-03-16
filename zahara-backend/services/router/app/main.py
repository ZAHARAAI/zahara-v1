import logging
import os
from typing import List, Optional

import litellm
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .middleware.observability import ObservabilityMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure LiteLLM
litellm.set_verbose = True  # Enable verbose logging for debugging

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

# Add observability middleware first
app.add_middleware(ObservabilityMiddleware)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
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

        # Set LiteLLM API keys
        if self.openai_api_key:
            os.environ["OPENAI_API_KEY"] = self.openai_api_key
        if self.anthropic_api_key:
            os.environ["ANTHROPIC_API_KEY"] = self.anthropic_api_key
        if self.openrouter_api_key:
            os.environ["OPENROUTER_API_KEY"] = self.openrouter_api_key

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

    def get_available_models(self) -> List[dict]:
        """Get list of available models based on configured API keys"""
        models = []

        if self.openai_api_key:
            models.extend([
                {"id": "gpt-3.5-turbo", "provider": "OpenAI"},
                {"id": "gpt-4", "provider": "OpenAI"},
                {"id": "gpt-4-turbo", "provider": "OpenAI"},
            ])

        if self.anthropic_api_key:
            models.extend([
                {"id": "claude-3-haiku-20240307", "provider": "Anthropic"},
                {"id": "claude-3-sonnet-20240229", "provider": "Anthropic"},
                {"id": "claude-3-opus-20240229", "provider": "Anthropic"},
            ])

        if self.openrouter_api_key:
            models.extend([
                {"id": "openrouter/auto", "provider": "OpenRouter"},
                {"id": "meta-llama/llama-2-70b-chat", "provider": "OpenRouter"},
                {"id": "mistralai/mixtral-8x7b-instruct", "provider": "OpenRouter"},
            ])

        return models

router_config = RouterConfig()

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "status": "running",
        "service": "Zahara.ai Router",
        "message": "Zahara.ai Router Service",
        "version": "1.0.0",
        "company": "Zahara.ai",
        "website": "https://zahara.ai"
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Zahara.ai Router",
        "company": "Zahara.ai"
    }

@app.get("/v1/models")
async def list_models():
    """List available models based on configured API keys"""
    models = router_config.get_available_models()

    if not models:
        raise HTTPException(
            status_code=501,
            detail="Not implemented: No API keys configured for any providers"
        )

    return {
        "object": "list",
        "data": models
    }

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """OpenAI-compatible chat completions endpoint using LiteLLM"""
    logger.info(f"Received chat completion request for model: {request.model}")
    logger.info(f"Request messages: {request.messages}")

    # Check if we have API keys for the requested model
    has_key, provider = router_config.has_provider_key(request.model)

    if not has_key:
        raise HTTPException(
            status_code=501,
            detail=f"Not implemented: No {provider} API keys configured for model '{request.model}'"
        )

    # Convert messages to LiteLLM format
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    try:
        logger.info(f"Routing to {provider} for model: {request.model}")

        # Use LiteLLM for the actual completion with timeout
        response = await litellm.acompletion(
            model=request.model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=request.stream,
            timeout=30.0,  # 30 second timeout
            max_retries=2,  # Retry up to 2 times on failure
        )

        logger.info(f"Successfully received response from {provider}")
        return response

    except litellm.exceptions.AuthenticationError as e:
        logger.error(f"Authentication error with {provider}: {str(e)}")
        # Check if this is actually due to missing API key (should have been caught earlier)
        if "No API key" in str(e) or "API key" in str(e):
            raise HTTPException(
                status_code=501,
                detail=f"Not implemented: No {provider} API keys configured"
            )
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed with {provider}: Invalid API key"
        )
    except litellm.exceptions.RateLimitError as e:
        logger.error(f"Rate limit error with {provider}: {str(e)}")
        # Quota exceeded should return 501 if this indicates API key is not configured properly
        if "quota" in str(e).lower() or "exceeded" in str(e).lower():
            raise HTTPException(
                status_code=501,
                detail=f"Not implemented: {provider} quota exceeded or API key not properly configured"
            )
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for {provider}: {str(e)}"
        )
    except litellm.exceptions.BadRequestError as e:
        logger.error(f"Bad request error with {provider}: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"Bad request to {provider}: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error routing to {provider}: {str(e)}")
        # Check if it's a quota/authentication related error that should be 501
        error_msg = str(e).lower()
        if any(keyword in error_msg for keyword in ["quota", "exceeded", "billing", "api key"]):
            raise HTTPException(
                status_code=501,
                detail=f"Not implemented: {provider} API not properly configured"
            )
        raise HTTPException(
            status_code=502,
            detail=f"Provider error: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7000)
