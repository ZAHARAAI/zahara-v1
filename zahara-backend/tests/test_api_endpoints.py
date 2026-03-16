"""Unit tests for API main endpoints"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_endpoint(async_client: AsyncClient):
    """Test the root endpoint"""
    response = await async_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "version" in data
    assert "docs" in data
    assert data["docs"] == "/docs"


@pytest.mark.asyncio
async def test_api_endpoints_exist(async_client: AsyncClient):
    """Test that main API endpoints exist"""
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
async def test_v1_chat_completions_endpoint(async_client: AsyncClient):
    """Test v1 chat completions endpoint"""
    response = await async_client.post("/v1/chat/completions", json={
        "model": "gpt-3.5-turbo",
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    })

    # Should return 501 for external models when no API keys
    assert response.status_code == 501
    data = response.json()
    assert "not implemented" in data["detail"].lower() or "not configured" in data["detail"].lower()


@pytest.mark.asyncio
async def test_v1_chat_completions_local_models(async_client: AsyncClient):
    """Test v1 chat completions with local models"""
    response = await async_client.post("/v1/chat/completions", json={
        "model": "tinyllama",
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    })

    # Should not return 501 for local models, but may return 400 if Ollama not available
    assert response.status_code != 501
    # Allow 400 (service unavailable) or 200 (success)
    assert response.status_code in [200, 400]
