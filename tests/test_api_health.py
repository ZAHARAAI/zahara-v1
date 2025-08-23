"""Unit tests for API health endpoints"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_basic_health_endpoint(async_client: AsyncClient):
    """Test the basic health endpoint"""
    response = await async_client.get("/health/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["message"] == "Zahara.ai API is running"


@pytest.mark.asyncio
async def test_comprehensive_health_endpoint(async_client: AsyncClient):
    """Test the comprehensive health endpoint"""
    response = await async_client.get("/health/all")
    assert response.status_code == 200
    data = response.json()
    assert "overall_status" in data
    assert "services" in data

    # Check that services dict contains expected service types
    services = data["services"]
    assert isinstance(services, dict)
    # Services may be unhealthy in test environment, but should be present
    expected_services = ["database", "redis", "qdrant", "llm"]
    for service in expected_services:
        assert service in services
