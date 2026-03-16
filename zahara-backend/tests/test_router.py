"""Tests for router service (these would run against the router service)"""
import pytest
import requests


def test_router_health():
    """Test router health endpoint - requires router service running"""
    try:
        response = requests.get("http://localhost:7000/health", timeout=5)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "Zahara.ai Router"
    except requests.exceptions.RequestException:
        pytest.skip("Router service not available")


def test_router_root():
    """Test router root endpoint"""
    try:
        response = requests.get("http://localhost:7000/", timeout=5)
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Zahara.ai Router Service"
        assert data["version"] == "1.0.0"
        # Router responds with service info (status field not required for this test)
        assert "service" in data
    except requests.exceptions.RequestException:
        pytest.skip("Router service not available")


def test_router_chat_completions_501():
    """Test router chat completions returns 501"""
    try:
        response = requests.post(
            "http://localhost:7000/v1/chat/completions",
            json={
                "model": "gpt-3.5-turbo",
                "messages": [{"role": "user", "content": "Hello"}]
            },
            timeout=5
        )
        assert response.status_code == 501
        data = response.json()
        assert "not implemented" in data["detail"].lower()
    except requests.exceptions.RequestException:
        pytest.skip("Router service not available")
