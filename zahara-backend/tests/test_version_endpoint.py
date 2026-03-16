"""Tests for version endpoint"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_version_endpoint(async_client: AsyncClient):
    """Test the version endpoint returns proper version information"""
    response = await async_client.get("/version/")
    assert response.status_code == 200

    data = response.json()
    assert "app_name" in data
    assert "version" in data
    assert "company" in data
    assert "git_hash" in data
    assert "git_timestamp" in data
    assert "build_timestamp" in data
    assert "environment" in data

    # Check specific values
    assert data["app_name"] == "Zahara.ai API"
    assert data["company"] == "Zahara.ai"
    assert data["version"] == "1.0.0"
    assert data["environment"] in ["development", "production"]
