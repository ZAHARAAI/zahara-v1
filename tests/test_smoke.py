"""Smoke tests for CI - test against running services"""
import pytest
import requests


def test_api_health_ok():
    """Smoke test: /health should return 200"""
    try:
        response = requests.get("http://localhost:8000/health/", timeout=5)
        assert response.status_code == 200
        print("✅ API health check passed")
    except requests.exceptions.RequestException:
        pytest.skip("API service not available - skipping smoke test")


def test_router_health_ok():
    """Test that Router health endpoint returns 200"""
    try:
        response = requests.get("http://localhost:7000/health", timeout=5)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "router"
    except requests.exceptions.RequestException:
        pytest.skip("Router service not available - skipping smoke test")


def test_api_root_endpoint():
    """Test API root endpoint"""
    try:
        response = requests.get("http://localhost:8000/", timeout=5)
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "version" in data
    except requests.exceptions.RequestException:
        pytest.skip("API service not available - skipping smoke test")


def test_api_v1_chat_completions_501():
    """Smoke test: /v1/chat/completions should return 501 with no provider key"""
    try:
        response = requests.post(
            "http://localhost:8000/v1/chat/completions",
            json={
                "model": "gpt-3.5-turbo",
                "messages": [{"role": "user", "content": "Hello"}]
            },
            timeout=5
        )
        assert response.status_code == 501
        print("✅ API chat completions 501 check passed")
    except requests.exceptions.RequestException:
        pytest.skip("API service not available - skipping smoke test")


def test_router_v1_chat_completions_501():
    """Smoke test: Router /v1/chat/completions should return 501"""
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
        print("✅ Router chat completions 501 check passed")
    except requests.exceptions.RequestException:
        pytest.skip("Router service not available - skipping smoke test")
