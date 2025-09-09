"""Tests for development mode functionality"""

import os

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_dev_endpoints_disabled_by_default(async_client: AsyncClient):
    """Test that dev endpoints are not available by default"""
    # Ensure dev mode is disabled
    os.environ.pop("ENABLE_DEV_PAGES", None)

    response = await async_client.get("/dev/test")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_dev_endpoints_enabled_with_env_var():
    """Test that dev endpoints are available when ENABLE_DEV_PAGES=1"""
    # Set dev mode
    os.environ["ENABLE_DEV_PAGES"] = "1"

    # Need to reimport app to pick up env var
    import sys
    from pathlib import Path

    api_path = Path(__file__).parent.parent / "services" / "api"
    sys.path.insert(0, str(api_path))

    import importlib

    import app.main

    importlib.reload(app.main)

    try:
        async with AsyncClient(app=app.main.app, base_url="http://test") as client:
            # Test dev endpoints
            response = await client.get("/dev/test")
            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Development mode is enabled"
            assert data["status"] == "dev"

            # Test dev health
            response = await client.get("/dev/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert data["mode"] == "development"
            assert data["dev_pages_enabled"] is True

    finally:
        # Clean up
        os.environ.pop("ENABLE_DEV_PAGES", None)
