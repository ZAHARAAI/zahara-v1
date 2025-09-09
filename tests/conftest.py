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
# Always use Docker Compose service endpoints - Docker Compose should be running for tests
os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ.setdefault("DEV_MODE", "true")
os.environ.setdefault("API_KEY_BYPASS_IN_DEV", "true")
os.environ.setdefault("DEMO_API_KEY", "zhr_demo_clinic_2024_observability_key")
os.environ.setdefault("TESTING", "true")

# Ensure no external API keys are set for testing (to avoid costs)
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("OPENROUTER_API_KEY", None)
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ.pop("GROQ_API_KEY", None)

# Import app after setting environment variables
from app.main import app  # noqa: E402
from app.services.api_key_service import APIKeyService  # noqa: E402


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_api_key():
    """Create a test API key for the entire test session."""
    try:
        import hashlib

        from app.database import get_db
        from app.models.user import User

        # Get database session
        db_gen = get_db()
        db = next(db_gen)

        try:
            # Create or get test user
            test_user = db.query(User).filter(User.email == "test@zahara.ai").first()
            if not test_user:
                test_user = User(
                    username="test_user",
                    email="test@zahara.ai",
                    hashed_password=hashlib.sha256("test123".encode()).hexdigest(),
                    is_active=True,
                )
                db.add(test_user)
                db.commit()
                db.refresh(test_user)

            # Create test API key
            api_key_service = APIKeyService()
            api_key_record, plaintext_key = api_key_service.create_api_key(
                db=db,
                name="Test Session API Key",
                description="API key for automated testing session",
                can_read=True,
                can_write=True,
                can_admin=True,
            )

            # Set the API key in environment for other tests to use
            os.environ["TEST_API_KEY"] = plaintext_key

            print(f"✅ Created test API key: {plaintext_key[:20]}...")

            yield plaintext_key

        except Exception as e:
            print(f"Warning: Could not create test API key: {e}")
            # Fallback to demo key
            demo_key = os.getenv(
                "DEMO_API_KEY", "zhr_demo_clinic_2024_observability_key"
            )
            os.environ["TEST_API_KEY"] = demo_key
            yield demo_key
        finally:
            db.close()

    except Exception as e:
        print(f"Error in test_api_key fixture: {e}")
        # Fallback to demo key
        demo_key = os.getenv("DEMO_API_KEY", "zhr_demo_clinic_2024_observability_key")
        os.environ["TEST_API_KEY"] = demo_key
        yield demo_key


@pytest.fixture
async def async_client():
    """Create an async test client with Docker Compose services."""
    # Always use real services - Docker Compose should be running
    # Use the seeded API key for testing (set in environment variables above)
    async with AsyncClient(app=app, base_url="http://test", timeout=10.0) as client:
        yield client


@pytest.fixture
async def dev_client():
    """Create an async test client with dev mode enabled."""
    # Set dev mode environment variable
    original_value = os.environ.get("ENABLE_DEV_PAGES")
    os.environ["ENABLE_DEV_PAGES"] = "1"

    try:
        async with AsyncClient(app=app, base_url="http://test", timeout=10.0) as client:
            yield client
    finally:
        # Restore original environment
        if original_value is not None:
            os.environ["ENABLE_DEV_PAGES"] = original_value
        else:
            os.environ.pop("ENABLE_DEV_PAGES", None)
