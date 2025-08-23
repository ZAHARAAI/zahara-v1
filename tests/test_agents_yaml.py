"""Tests for YAML-based agents configuration"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_configured_agents_endpoint(async_client: AsyncClient):
    """Test listing configured agents from YAML"""
    response = await async_client.get("/agents/configured")
    assert response.status_code == 200
    
    data = response.json()
    assert "agents" in data
    assert isinstance(data["agents"], list)
    
    # Should have at least the default agents from YAML
    if data["agents"]:
        agent = data["agents"][0]
        assert "id" in agent
        assert "name" in agent
        assert "description" in agent
        assert "system_prompt" in agent


@pytest.mark.asyncio
async def test_agent_capabilities_endpoint(async_client: AsyncClient):
    """Test getting agents by capability"""
    response = await async_client.get("/agents/capabilities/general_assistance")
    assert response.status_code == 200
    
    data = response.json()
    assert "capability" in data
    assert "agents" in data
    assert data["capability"] == "general_assistance"


def test_agent_service_yaml_parsing():
    """Test agent service YAML parsing"""
    from app.services.agent_service import AgentService
    
    service = AgentService()
    
    # Test basic functionality
    agents = service.list_agents()
    assert isinstance(agents, list)
    
    # Test getting default agent
    default_agent = service.get_default_agent()
    if default_agent:
        assert "id" in default_agent
        assert "name" in default_agent
    
    # Test vector config
    vector_config = service.get_vector_config()
    assert isinstance(vector_config, dict)
    
    # Test model mappings
    model_mappings = service.get_model_mappings()
    assert isinstance(model_mappings, dict)
