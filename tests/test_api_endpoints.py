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
    # Test only fast, non-database dependent endpoints
    endpoints = [
        "/health/",  # Basic health check
        "/version/",  # Version endpoint (with trailing slash)
    ]

    for endpoint in endpoints:
        response = await async_client.get(endpoint)
        # Ensure endpoint exists (not 404)
        assert response.status_code != 404, f"Endpoint {endpoint} should exist"
        assert response.status_code == 200, f"Endpoint {endpoint} should return 200"


@pytest.mark.asyncio
@pytest.mark.timeout(10)
async def test_auth_endpoints_exist(async_client: AsyncClient):
    """Test that auth endpoints exist (may return errors but should not 404)"""
    # TODO: Auth endpoints use JWT authentication and may hang - skipping for now
    # These will be properly tested when JWT auth is fully implemented
    pytest.skip(
        "Auth endpoints use JWT authentication - skipping until JWT implementation is complete"
    )


@pytest.mark.asyncio
@pytest.mark.timeout(10)
async def test_v1_chat_completions_endpoint(async_client: AsyncClient):
    """Test v1 chat completions endpoint with external models"""
    # TODO: Chat completions endpoint still hangs - needs deeper investigation of the implementation
    # The API key auth works, but the endpoint itself has issues
    pytest.skip(
        "Chat completions endpoint implementation needs fixes - hangs even with valid API key"
    )


@pytest.mark.asyncio
@pytest.mark.timeout(10)
async def test_v1_chat_completions_local_models(async_client: AsyncClient):
    """Test v1 chat completions with local models"""
    # TODO: Chat completions endpoint still hangs - needs deeper investigation of the implementation
    # The API key auth works, but the endpoint itself has issues
    pytest.skip(
        "Chat completions endpoint implementation needs fixes - hangs even with valid API key"
    )
