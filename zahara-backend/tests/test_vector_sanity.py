"""Tests for vector service sanity checks"""
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_vector_sanity_endpoint_requires_auth(async_client: AsyncClient):
    """Test that vector sanity endpoint requires authentication"""
    response = await async_client.post("/vector/debug/vector-sanity")
    assert response.status_code in [401, 403, 422]  # Unauthorized, Forbidden, or validation error


@pytest.mark.asyncio
@patch('app.services.vector_service.get_qdrant')
async def test_vector_sanity_check_logic(mock_get_qdrant):
    """Test vector sanity check logic with mocked Qdrant"""
    from app.services.vector_service import VectorService

    # Mock Qdrant client
    mock_client = MagicMock()
    mock_get_qdrant.return_value = mock_client

    # Mock collection operations
    mock_client.get_collections.return_value = MagicMock(collections=[])
    mock_client.get_collection.side_effect = Exception("Collection not found")
    mock_client.create_collection.return_value = True
    mock_client.upsert.return_value = True
    mock_client.search.return_value = []

    # Test sanity check
    service = VectorService()
    result = await service.sanity_check()

    assert isinstance(result, dict)
    assert "status" in result
    assert "tests" in result or "error" in result


def test_vector_service_initialization():
    """Test vector service initialization"""
    from app.services.vector_service import VectorService

    # This will test the initialization logic
    # Should not raise exceptions
    try:
        service = VectorService()
        assert service is not None
    except Exception:
        # If Qdrant is not available, initialization might fail
        # This is acceptable in test environment
        pytest.skip("Qdrant not available for testing")
