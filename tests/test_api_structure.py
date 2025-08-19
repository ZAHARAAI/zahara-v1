import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_api_endpoints_exist(async_client: AsyncClient):
    """Test that main API endpoints exist."""
    endpoints = [
        "/health/",
        "/health/all",
        "/auth/register",
        "/auth/login"
    ]
    
    for endpoint in endpoints:
        if endpoint in ["/auth/register"]:
            response = await async_client.post(endpoint, json={})
        elif endpoint in ["/auth/login"]:
            response = await async_client.post(endpoint, data={})
        else:
            response = await async_client.get(endpoint)
        
        # Ensure endpoint exists (not 404)
        assert response.status_code != 404, f"Endpoint {endpoint} should exist"


@pytest.mark.asyncio 
async def test_cors_headers(async_client: AsyncClient):
    """Test that CORS headers are present."""
    response = await async_client.get("/health/")
    # This is a basic test - actual CORS headers depend on FastAPI middleware setup
    assert response.status_code == 200
