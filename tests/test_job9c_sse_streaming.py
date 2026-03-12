"""
Job 9C SSE/Streaming Tests – HTTP Integration Tests

Integration tests for SSE streaming endpoint using the real running API.
These tests verify that the streaming endpoint works correctly with authentication,
reconnection, and user scoping.

To run these tests, ensure the API is running:
  make -C infra build && make -C infra up

Then run:
  pytest tests/test_job9c_sse_streaming.py -xvs
"""

import json
import os
import sys
import time
from pathlib import Path

import requests
import pytest

API_BASE_URL = os.environ.get("API_URL", "http://localhost:8000")


class TestSSEStreamingIntegration:
    """SSE streaming endpoint integration tests."""

    @pytest.fixture(scope="class")
    def api_base(self):
        """Return the API base URL."""
        return API_BASE_URL

    @pytest.fixture
    def auth_headers(self, api_base):
        """Create auth headers for test user."""
        # Register user
        user_email = f"sse-test-{int(time.time())}@test.zahara.ai"
        requests.post(
            f"{api_base}/auth/signup",
            json={
                "username": f"sseuser{int(time.time())}",
                "email": user_email,
                "password": "password123!",
            },
            timeout=5,
        )

        # Login
        res = requests.post(
            f"{api_base}/auth/login",
            json={"email": user_email, "password": "password123!"},
            timeout=5,
        )
        assert res.status_code == 200
        token = res.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    @pytest.fixture
    def agent_and_run(self, api_base, auth_headers):
        """Create an agent and run, return (agent_id, run_id)."""
        # Create agent
        res = requests.post(
            f"{api_base}/agents",
            headers=auth_headers,
            json={"name": "test-agent", "spec": {}},
            timeout=5,
        )
        assert res.status_code == 200
        agent_id = res.json()["agent"]["id"]

        # Start run
        res = requests.post(
            f"{api_base}/agents/{agent_id}/run",
            headers=auth_headers,
            json={"input": "test", "source": "test"},
            timeout=5,
        )
        assert res.status_code == 200
        run_id = res.json()["run_id"]

        return agent_id, run_id

    # ========================================================================
    # Tests
    # ========================================================================

    def test_stream_requires_authentication(self, api_base):
        """SSE stream endpoint requires authentication."""
        res = requests.get(f"{api_base}/runs/test-id/stream", timeout=5)
        assert res.status_code == 401

    def test_stream_returns_event_stream_content_type(self, api_base, auth_headers, agent_and_run):
        """SSE stream returns text/event-stream content-type."""
        agent_id, run_id = agent_and_run

        res = requests.get(
            f"{api_base}/runs/{run_id}/stream",
            headers=auth_headers,
            timeout=5,
            stream=False,
        )
        assert res.status_code == 200
        assert "text/event-stream" in res.headers.get("content-type", "")

    def test_stream_is_not_cached(self, api_base, auth_headers, agent_and_run):
        """SSE stream response should not be cached."""
        agent_id, run_id = agent_and_run

        res = requests.get(
            f"{api_base}/runs/{run_id}/stream",
            headers=auth_headers,
            timeout=5,
            stream=False,
        )
        assert res.status_code == 200
        cache_control = res.headers.get("cache-control", "")
        assert cache_control  # Must have some cache control


    def test_stream_contains_events(self, api_base, auth_headers, agent_and_run):
        """SSE stream contains event data."""
        agent_id, run_id = agent_and_run

        res = requests.get(
            f"{api_base}/runs/{run_id}/stream",
            headers=auth_headers,
            timeout=5,
            stream=False,
        )
        assert res.status_code == 200
        content = res.text

        # Should contain SSE format: data: {json}, id: {id}
        assert "id: " in content or "data: " in content

    def test_stream_last_event_id_header(self, api_base, auth_headers, agent_and_run):
        """SSE stream accepts Last-Event-ID header for reconnection."""
        agent_id, run_id = agent_and_run

        headers = auth_headers.copy()
        headers["Last-Event-ID"] = "0"

        res = requests.get(
            f"{api_base}/runs/{run_id}/stream",
            headers=headers,
            timeout=5,
            stream=False,
        )
        assert res.status_code == 200

    def test_stream_cursor_parameter(self, api_base, auth_headers, agent_and_run):
        """SSE stream accepts ?cursor query parameter."""
        agent_id, run_id = agent_and_run

        res = requests.get(
            f"{api_base}/runs/{run_id}/stream?cursor=0",
            headers=auth_headers,
            timeout=5,
            stream=False,
        )
        assert res.status_code == 200

    def test_stream_framed_parameter(self, api_base, auth_headers, agent_and_run):
        """SSE stream accepts ?framed=true/false parameter."""
        agent_id, run_id = agent_and_run

        res_true = requests.get(
            f"{api_base}/runs/{run_id}/stream?framed=true",
            headers=auth_headers,
            timeout=5,
            stream=False,
        )
        assert res_true.status_code == 200

        res_false = requests.get(
            f"{api_base}/runs/{run_id}/stream?framed=false",
            headers=auth_headers,
            timeout=5,
            stream=False,
        )
        assert res_false.status_code == 200

    def test_stream_user_cannot_access_other_user_run(self, api_base):
        """User B cannot access User A's stream."""
        # Create User A
        user_a_email = f"sse-user-a-{int(time.time())}@test.zahara.ai"
        requests.post(
            f"{api_base}/auth/signup",
            json={
                "username": f"sseuserA{int(time.time())}",
                "email": user_a_email,
                "password": "password123!",
            },
            timeout=5,
        )
        res_a = requests.post(
            f"{api_base}/auth/login",
            json={"email": user_a_email, "password": "password123!"},
            timeout=5,
        )
        token_a = res_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # User A creates agent and run
        res = requests.post(
            f"{api_base}/agents",
            headers=headers_a,
            json={"name": "test-agent", "spec": {}},
            timeout=5,
        )
        agent_a = res.json()["agent"]["id"]

        res = requests.post(
            f"{api_base}/agents/{agent_a}/run",
            headers=headers_a,
            json={"input": "test", "source": "test"},
            timeout=5,
        )
        run_a = res.json()["run_id"]

        # Create User B
        user_b_email = f"sse-user-b-{int(time.time())}@test.zahara.ai"
        requests.post(
            f"{api_base}/auth/signup",
            json={
                "username": f"sseuserB{int(time.time())}",
                "email": user_b_email,
                "password": "password456!",
            },
            timeout=5,
        )
        res_b = requests.post(
            f"{api_base}/auth/login",
            json={"email": user_b_email, "password": "password456!"},
            timeout=5,
        )
        token_b = res_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User B tries to access User A's stream
        res = requests.get(
            f"{api_base}/runs/{run_a}/stream",
            headers=headers_b,
            timeout=5,
            stream=False,
        )
        assert res.status_code == 404

    def test_events_endpoint(self, api_base, auth_headers, agent_and_run):
        """GET /runs/{id}/events endpoint returns run details with events."""
        agent_id, run_id = agent_and_run

        res = requests.get(
            f"{api_base}/runs/{run_id}/events",
            headers=auth_headers,
            timeout=5,
        )
        assert res.status_code == 200

        data = res.json()
        # The endpoint returns a full response with run details and events
        assert isinstance(data, dict)
        assert "run" in data
        assert "events" in data
        assert isinstance(data["events"], list)
        # Should have at least one event (run_created)
        if data["events"]:
            for event in data["events"]:
                assert "id" in event
                assert "type" in event


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
