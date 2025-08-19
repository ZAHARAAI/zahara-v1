import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint(async_client: AsyncClient):
    """Test the health endpoint."""
    response = await async_client.get("/health/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_health_all_endpoint(async_client: AsyncClient):
    """Test the comprehensive health endpoint."""
    response = await async_client.get("/health/all")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "timestamp" in data
    assert "services" in data
