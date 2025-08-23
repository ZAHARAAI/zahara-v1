"""Tests for API key authentication"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_api_keys_list_requires_auth(async_client: AsyncClient):
    """Test that API keys endpoint requires authentication"""
    response = await async_client.get("/api-keys/")
    assert response.status_code in [401, 403, 422]  # Unauthorized, Forbidden, or validation error


@pytest.mark.asyncio
async def test_create_api_key_requires_auth(async_client: AsyncClient):
    """Test that creating API keys requires authentication"""
    response = await async_client.post("/api-keys/", json={
        "name": "test-key",
        "description": "Test API key"
    })
    assert response.status_code in [401, 403, 422]  # Unauthorized, Forbidden, or validation error


@pytest.mark.asyncio
async def test_api_key_validation():
    """Test API key validation logic"""
    from app.services.api_key_service import APIKeyService

    service = APIKeyService()

    # Test key generation
    key = service.generate_api_key()
    assert key.startswith("zhr_")
    assert len(key) == 52  # zhr_ + 48 characters

    # Test key hashing
    key_hash = service.hash_api_key(key)
    assert len(key_hash) == 64  # SHA256 hex digest
    assert key_hash != key

    # Test key prefix
    prefix = service.get_key_prefix(key)
    assert prefix == key[:12]  # First 12 characters for zhr_ keys
