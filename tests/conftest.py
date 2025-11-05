import asyncio
import os
import sys
from pathlib import Path

import pytest
from httpx import AsyncClient

# Add services/api to Python path for imports
api_path = Path(__file__).parent.parent / "services" / "api"
sys.path.insert(0, str(api_path))

# Set test environment variables before importing app
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
# Ensure no API keys are set for testing
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OPENROUTER_API_KEY", None)

# Import app after setting environment variables
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def async_client():
    """Create an async test client."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.fixture
async def dev_client():
    """Create an async test client with dev mode enabled."""
    # Set dev mode environment variable
    original_value = os.environ.get("ENABLE_DEV_PAGES")
    os.environ["ENABLE_DEV_PAGES"] = "1"

    # Reimport the app to pick up the dev routes
    import importlib

    import app.main

    importlib.reload(app.main)

    try:
        async with AsyncClient(app=app.main.app, base_url="http://test") as client:
            yield client
    finally:
        # Restore original environment
        if original_value is not None:
            os.environ["ENABLE_DEV_PAGES"] = original_value
        else:
            os.environ.pop("ENABLE_DEV_PAGES", None)
