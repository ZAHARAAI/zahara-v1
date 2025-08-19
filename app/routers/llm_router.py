from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ..services.llm_service import LLMService
from ..middleware.auth import get_current_user
from ..models.user import User

router = APIRouter(prefix="/llm", tags=["llm"])

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
    request: ChatCompletionRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate chat completion"""
    llm_service = LLMService()
    
    # Convert Pydantic models to dicts
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    
    result = await llm_service.chat_completion(
        messages=messages,
        model=request.model,
        provider=request.provider
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result

@router.post("/generate")
async def generate_text(
    request: TextGenerationRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate text completion"""
    llm_service = LLMService()
    
    result = await llm_service.generate_text(
        prompt=request.prompt,
        model=request.model,
        provider=request.provider
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result

@router.get("/models")
async def get_models(
    provider: str = "local",
    current_user: User = Depends(get_current_user)
):
    """Get available models for a provider"""
    llm_service = LLMService()
    
    result = await llm_service.get_available_models(provider=provider)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result