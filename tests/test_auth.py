import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_endpoint_exists(async_client: AsyncClient):
    """Test that the register endpoint exists and returns appropriate response."""
    response = await async_client.post("/auth/register", json={
        "username": "testuser",
        "email": "test@example.com", 
        "password": "testpass123"
    })
    # Just check that the endpoint exists (may return 422 for validation errors, but not 404)
    assert response.status_code != 404


@pytest.mark.asyncio
async def test_login_endpoint_exists(async_client: AsyncClient):
    """Test that the login endpoint exists and returns appropriate response."""
    response = await async_client.post("/auth/login", data={
        "username": "testuser",
        "password": "testpass123"
    })
    # Just check that the endpoint exists (may return 401 for auth errors, but not 404)
    assert response.status_code != 404
