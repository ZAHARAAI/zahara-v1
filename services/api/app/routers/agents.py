from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..models.user import User
from ..services.llm_service import LLMService
from ..services.agent_service import AgentService

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
    """List all available agents from configuration and user-created agents"""
    agent_service = AgentService()
    
    # Get configured agents from YAML
    configured_agents = agent_service.list_agents()
    
    # Get user-created agents
    user_agents = [
        agent for agent in agents_storage.values()
        if agent["created_by"] == current_user.username
    ]
    
    return {
        "configured_agents": configured_agents,
        "custom_agents": user_agents,
        "total_count": len(configured_agents) + len(user_agents)
    }

@router.get("/configured")
async def list_configured_agents():
    """List all pre-configured agents from YAML"""
    agent_service = AgentService()
    return {"agents": agent_service.list_agents()}

@router.get("/configured/{agent_id}")
async def get_configured_agent(agent_id: str):
    """Get a specific configured agent by ID"""
    agent_service = AgentService()
    agent = agent_service.get_agent_by_id(agent_id)
    
    if not agent:
        raise HTTPException(status_code=404, detail="Configured agent not found")
    
    return agent

@router.get("/capabilities/{capability}")
async def get_agents_by_capability(capability: str):
    """Get agents that have a specific capability"""
    agent_service = AgentService()
    agents = agent_service.get_agents_by_capability(capability)
    
    return {"capability": capability, "agents": agents}

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
    request: ChatWithAgentRequest
):
    """Chat with a specific agent (custom or configured)"""
    agent_service = AgentService()
    agent = None
    
    # First check if it's a configured agent
    configured_agent = agent_service.get_agent_by_id(agent_id)
    if configured_agent:
        agent = configured_agent
    # Then check custom agents
    elif agent_id in agents_storage:
        agent = agents_storage[agent_id]
        # For custom agents, we would check authentication here
        # For now, allowing access for demo purposes
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get or create conversation
    conversation_id = request.conversation_id or f"{agent_id}_demo_user"

    if conversation_id not in conversations_storage:
        conversations_storage[conversation_id] = []

    conversation = conversations_storage[conversation_id]

    # Build messages with system prompt
    messages = [{"role": "system", "content": agent["system_prompt"]}]
    messages.extend(conversation)
    messages.append({"role": "user", "content": request.message})

    # Get response from LLM or provide demo response
    llm_service = LLMService()
    result = await llm_service.chat_completion(
        messages=messages,
        model=agent["model"],
        provider=agent["provider"]
    )

    # If LLM service returns an error, provide a demo response
    if "error" in result:
        # Create a demo response based on the agent
        demo_response = f"""Hello! I'm {agent['name']}, {agent['description']}.

You said: "{request.message}"

This is a demo response since external LLM providers aren't configured yet. In a production environment, I would use {agent['model']} via {agent['provider']} to provide intelligent responses based on my system prompt:

"{agent['system_prompt'][:100]}..."

To enable full functionality, please configure API keys for the LLM providers in your environment variables."""

        result = {
            "provider": f"{agent['provider']} (demo)",
            "model": agent["model"],
            "message": demo_response
        }

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
