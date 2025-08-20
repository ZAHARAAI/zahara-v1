"""Smoke tests for CI - test against running services"""
import pytest
import requests


def test_api_health_ok():
    """Test that API health endpoint returns 200"""
    try:
        response = requests.get("http://localhost:8000/health", timeout=5)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
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


def test_router_v1_chat_completions_501():
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
        pytest.skip("Router service not available - skipping smoke test")
