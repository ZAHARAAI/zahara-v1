from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.llm_service import LLMService
from ..middleware.auth import get_current_user
from ..models.user import User
import json

router = APIRouter(prefix="/agents", tags=["agents"])

class CreateAgentRequest(BaseModel):
    name: str
    description: str
    system_prompt: str
    model: Optional[str] = None
    provider: str = "local"

class ChatWithAgentRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None

class AgentResponse(BaseModel):
    id: str
    name: str
    description: str
    system_prompt: str
    model: Optional[str]
    provider: str
    created_by: str

# In-memory storage for demo purposes
# In production, you'd want to store this in the database
agents_storage = {}
conversations_storage = {}

@router.post("/create")
async def create_agent(
    request: CreateAgentRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new AI agent"""
    import uuid
    
    agent_id = str(uuid.uuid4())
    agent = {
        "id": agent_id,
        "name": request.name,
        "description": request.description,
        "system_prompt": request.system_prompt,
        "model": request.model,
        "provider": request.provider,
        "created_by": current_user.username
    }
    
    agents_storage[agent_id] = agent
    
    return agent

@router.get("/list")
async def list_agents(current_user: User = Depends(get_current_user)):
    """List all agents created by the current user"""
    user_agents = [
        agent for agent in agents_storage.values()
        if agent["created_by"] == current_user.username
    ]
    
    return {"agents": user_agents}

@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific agent"""
    if agent_id not in agents_storage:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = agents_storage[agent_id]
    
    if agent["created_by"] != current_user.username:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return agent

@router.post("/{agent_id}/chat")
async def chat_with_agent(
    agent_id: str,
    request: ChatWithAgentRequest,
    current_user: User = Depends(get_current_user)
):
    """Chat with a specific agent"""
    if agent_id not in agents_storage:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = agents_storage[agent_id]
    
    if agent["created_by"] != current_user.username:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get or create conversation
    conversation_id = request.conversation_id or f"{agent_id}_{current_user.username}"
    
    if conversation_id not in conversations_storage:
        conversations_storage[conversation_id] = []
    
    conversation = conversations_storage[conversation_id]
    
    # Build messages with system prompt
    messages = [{"role": "system", "content": agent["system_prompt"]}]
    messages.extend(conversation)
    messages.append({"role": "user", "content": request.message})
    
    # Get response from LLM
    llm_service = LLMService()
    result = await llm_service.chat_completion(
        messages=messages,
        model=agent["model"],
        provider=agent["provider"]
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    # Update conversation history
    conversation.append({"role": "user", "content": request.message})
    conversation.append({"role": "assistant", "content": result["message"]})
    
    # Keep only last 20 messages to prevent memory issues
    if len(conversation) > 20:
        conversation = conversation[-20:]
        conversations_storage[conversation_id] = conversation
    
    return {
        "agent_id": agent_id,
        "conversation_id": conversation_id,
        "response": result["message"],
        "model_info": {
            "provider": result.get("provider"),
            "model": result.get("model")
        }
    }

@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an agent"""
    if agent_id not in agents_storage:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = agents_storage[agent_id]
    
    if agent["created_by"] != current_user.username:
        raise HTTPException(status_code=403, detail="Access denied")
    
    del agents_storage[agent_id]
    
    # Clean up conversations for this agent
    conversations_to_delete = [
        conv_id for conv_id in conversations_storage.keys()
        if conv_id.startswith(agent_id)
    ]
    
    for conv_id in conversations_to_delete:
        del conversations_storage[conv_id]
    
    return {"message": "Agent deleted successfully"}