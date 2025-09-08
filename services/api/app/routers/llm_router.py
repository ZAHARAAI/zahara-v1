from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..models.user import User
from ..services.llm_service import LLMService

router = APIRouter(prefix="/llm", tags=["llm"])

# OpenAI-compatible router for standard endpoints
v1_router = APIRouter(prefix="/v1", tags=["openai-compatible"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = None
    provider: str = "local"


class TextGenerationRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    provider: str = "local"


@router.post("/chat")
async def chat_completion(
    request: ChatCompletionRequest, current_user: User = Depends(get_current_user)
):
    """Generate chat completion"""
    llm_service = LLMService()

    # Convert Pydantic models to dicts
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    result = await llm_service.chat_completion(
        messages=messages, model=request.model, provider=request.provider
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.post("/generate")
async def generate_text(
    request: TextGenerationRequest, current_user: User = Depends(get_current_user)
):
    """Generate text completion"""
    llm_service = LLMService()

    result = await llm_service.generate_text(
        prompt=request.prompt, model=request.model, provider=request.provider
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get("/models")
async def get_models(
    provider: str = "local", current_user: User = Depends(get_current_user)
):
    """Get available models for a provider"""
    llm_service = LLMService()

    result = await llm_service.get_available_models(provider=provider)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


# OpenAI-compatible endpoint models
class OpenAIChatMessage(BaseModel):
    role: str
    content: str


class OpenAIChatCompletionRequest(BaseModel):
    model: str
    messages: List[OpenAIChatMessage]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False


@v1_router.post("/chat/completions")
async def openai_chat_completions(request: OpenAIChatCompletionRequest):
    """OpenAI-compatible chat completions endpoint"""
    # Check if we have any provider keys configured
    llm_service = LLMService()

    # If no valid API keys are configured and trying to use non-local models, return 501
    def is_valid_api_key(key):
        return key and key not in [
            None,
            "",
            "your_openai_key_here",
            "your_openrouter_key_here",
        ]

    if (
        request.model not in ["tinyllama", "llama2", "llama3", "codellama"]
        and not is_valid_api_key(llm_service.openai_api_key)
        and not is_valid_api_key(llm_service.openrouter_api_key)
    ):
        raise HTTPException(
            status_code=501,
            detail="Not implemented: No provider API keys configured for this model",
        )

    # Convert to our internal format
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    # Determine provider based on model
    if request.model.startswith("gpt-"):
        provider = "openai"
    elif request.model in ["tinyllama", "llama2", "llama3", "codellama"]:
        provider = "local"
    else:
        provider = "openrouter"

    result = await llm_service.chat_completion(
        messages=messages, model=request.model, provider=provider
    )

    if "error" in result:
        if "not configured" in result["error"]:
            raise HTTPException(status_code=501, detail=result["error"])
        raise HTTPException(status_code=400, detail=result["error"])

    # Return OpenAI-compatible format
    return {
        "id": f"chatcmpl-{hash(str(messages))}"[:28],
        "object": "chat.completion",
        "created": 1677652288,
        "model": request.model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": result.get("message", "")},
                "finish_reason": "stop",
            }
        ],
        "usage": result.get(
            "usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        ),
    }
