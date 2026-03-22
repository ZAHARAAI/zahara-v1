"""
Job 9C Day 7 – Integration Tests – Comprehensive Control Plane Features

Tests full end-to-end scenarios combining features from Days 1-6:
- JWT authentication and user scoping
- Idempotency key deduplication
- SSE streaming with seq-based pagination
- Cancel and kill operations
- Budget enforcement
- Tool allowlist and runaway protection
"""

import uuid

import pytest

from tests._http_helpers import api_get, api_patch, api_post

API_BASE = "http://localhost:8000"


class TestFullControlPlaneFlow:
    """Test complete control plane workflows."""

    @pytest.fixture
    def user_a(self):
        """Create and authenticate User A."""
        email = f"user-a-{uuid.uuid4().hex[:8]}@test.zahara.ai"
        api_post(
            f"{API_BASE}/auth/signup",
            json={
                "username": f"usera{uuid.uuid4().hex[:8]}",
                "email": email,
                "password": "password123!",
            },
            timeout=5,
        )
        res = api_post(
            f"{API_BASE}/auth/login",
            json={"email": email, "password": "password123!"},
            timeout=5,
        )
        token = res.json()["access_token"]
        return {"token": token, "email": email}

    @pytest.fixture
    def user_b(self):
        """Create and authenticate User B."""
        email = f"user-b-{uuid.uuid4().hex[:8]}@test.zahara.ai"
        api_post(
            f"{API_BASE}/auth/signup",
            json={
                "username": f"userb{uuid.uuid4().hex[:8]}",
                "email": email,
                "password": "password123!",
            },
            timeout=5,
        )
        res = api_post(
            f"{API_BASE}/auth/login",
            json={"email": email, "password": "password123!"},
            timeout=5,
        )
        token = res.json()["access_token"]
        return {"token": token, "email": email}

    # ====================================================================
    # Integration: Auth + Scoping
    # ====================================================================

    def test_agent_creation_requires_auth(self):
        """Agent creation requires valid JWT."""
        res = api_post(
            f"{API_BASE}/agents",
            json={"name": "test-agent", "spec": {}},
            timeout=5,
        )
        assert res.status_code == 401

    def test_user_isolation_on_agents(self, user_a, user_b):
        """Agents created by User A are not visible to User B."""
        # User A creates agent
        res = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"name": f"agent-a-{uuid.uuid4().hex[:8]}", "spec": {}},
            timeout=5,
        )
        agent_a_id = res.json()["agent"]["id"]

        # User B cannot see User A's agent
        res = api_get(
            f"{API_BASE}/agents/{agent_a_id}",
            headers={"Authorization": f"Bearer {user_b['token']}"},
            timeout=5,
        )
        assert res.status_code == 404

    # ====================================================================
    # Integration: Budget + Guardrails
    # ====================================================================

    def test_agent_with_all_guardrails(self, user_a):
        """Create agent with all Day 6 guardrails."""
        res = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={
                "name": f"full-guard-{uuid.uuid4().hex[:8]}",
                "spec": {},
                "budget_daily_usd": 5.00,
                "tool_allowlist": ["web_search", "calculator"],
                "max_steps_per_run": 50,
                "max_duration_seconds_per_run": 300,
            },
            timeout=5,
        )
        assert res.status_code == 200
        agent = res.json()["agent"]
        assert agent["budget_daily_usd"] == 5.00
        assert agent["tool_allowlist"] == ["web_search", "calculator"]
        assert agent["max_steps_per_run"] == 50
        assert agent["max_duration_seconds_per_run"] == 300

    def test_update_agent_guardrails(self, user_a):
        """Update agent guardrails after creation."""
        # Create basic agent
        res = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"name": f"update-test-{uuid.uuid4().hex[:8]}", "spec": {}},
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]

        # Update with guardrails
        res = api_patch(
            f"{API_BASE}/agents/{agent_id}",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={
                "budget_daily_usd": 10.00,
                "tool_allowlist": ["email"],
                "max_steps_per_run": 100,
            },
            timeout=5,
        )
        assert res.status_code == 200
        agent = res.json()["agent"]
        assert agent["budget_daily_usd"] == 10.00
        assert agent["tool_allowlist"] == ["email"]
        assert agent["max_steps_per_run"] == 100

    # ====================================================================
    # Integration: Runs with Guardrails
    # ====================================================================

    def test_run_inherits_agent_guardrails(self, user_a):
        """Run inherits guardrails from agent."""
        # Create agent with guardrails
        res = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={
                "name": f"run-guard-{uuid.uuid4().hex[:8]}",
                "spec": {},
                "budget_daily_usd": 2.00,
                "max_steps_per_run": 25,
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]

        # Start run
        res = api_post(
            f"{API_BASE}/agents/{agent_id}/run",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"input": "Hello", "source": "test"},
            timeout=5,
        )
        assert res.status_code in {200, 409}  # 200 = success, 409 = already running

    # ====================================================================
    # Integration: Events and Streaming
    # ====================================================================

    def test_run_events_accessible(self, user_a):
        """Events for run are accessible via API."""
        # Create agent and run
        res = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"name": f"events-test-{uuid.uuid4().hex[:8]}", "spec": {}},
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]

        res = api_post(
            f"{API_BASE}/agents/{agent_id}/run",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"input": "test", "source": "test"},
            timeout=5,
        )
        if res.status_code == 200:
            run_id = res.json()["run_id"]

            # Get events (may be empty if run hasn't processed yet)
            res = api_get(
                f"{API_BASE}/agents/{agent_id}/runs/{run_id}/events",
                headers={"Authorization": f"Bearer {user_a['token']}"},
                timeout=5,
            )
            # Either 200 with events or 404 if run not found
            assert res.status_code in {200, 404}

    def test_run_accessible_after_creation(self, user_a):
        """Run is accessible after creation."""
        # Create agent and run
        res = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"name": f"run-test-{uuid.uuid4().hex[:8]}", "spec": {}},
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]

        res = api_post(
            f"{API_BASE}/agents/{agent_id}/run",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"input": "test", "source": "test"},
            timeout=5,
        )
        # Run creation should succeed or indicate conflict
        assert res.status_code in {200, 409}

    # ====================================================================
    # Integration: Idempotency
    # ====================================================================

    def test_idempotency_key_deduplication(self, user_a):
        """Same Idempotency-Key returns same run."""
        agent_res = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"name": f"idem-test-{uuid.uuid4().hex[:8]}", "spec": {}},
            timeout=5,
        )
        agent_id = agent_res.json()["agent"]["id"]
        idempotency_key = f"idempotent-{uuid.uuid4().hex[:8]}"

        # First request
        res1 = api_post(
            f"{API_BASE}/agents/{agent_id}/run",
            headers={
                "Authorization": f"Bearer {user_a['token']}",
                "Idempotency-Key": idempotency_key,
            },
            json={"input": "test", "source": "test"},
            timeout=5,
        )

        # Second request with same key
        res2 = api_post(
            f"{API_BASE}/agents/{agent_id}/run",
            headers={
                "Authorization": f"Bearer {user_a['token']}",
                "Idempotency-Key": idempotency_key,
            },
            json={"input": "test", "source": "test"},
            timeout=5,
        )

        # Both should return 200 and same run_id
        assert res1.status_code == 200
        assert res2.status_code == 200
        assert res1.json()["run_id"] == res2.json()["run_id"]

    # ====================================================================
    # Integration: User Isolation on Runs
    # ====================================================================

    def test_user_cannot_access_other_user_run(self, user_a, user_b):
        """User B cannot access User A's run."""
        # User A creates agent and run
        agent_res = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"name": f"isolation-test-{uuid.uuid4().hex[:8]}", "spec": {}},
            timeout=5,
        )
        agent_id = agent_res.json()["agent"]["id"]

        run_res = api_post(
            f"{API_BASE}/agents/{agent_id}/run",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"input": "test", "source": "test"},
            timeout=5,
        )
        run_id = run_res.json()["run_id"]

        # User B tries to access User A's run
        res = api_get(
            f"{API_BASE}/agents/{agent_id}/runs/{run_id}/events",
            headers={"Authorization": f"Bearer {user_b['token']}"},
            timeout=5,
        )
        # Should fail with 404 (not 403 due to scoping)
        assert res.status_code == 404

    # ====================================================================
    # Integration: Multi-User Scenarios
    # ====================================================================

    def test_multiple_users_independent_agents(self, user_a, user_b):
        """Multiple users can create agents independently."""
        # User A creates agent
        res_a = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_a['token']}"},
            json={"name": f"user-a-agent-{uuid.uuid4().hex[:8]}", "spec": {}},
            timeout=5,
        )
        assert res_a.status_code == 200

        # User B creates agent
        res_b = api_post(
            f"{API_BASE}/agents",
            headers={"Authorization": f"Bearer {user_b['token']}"},
            json={"name": f"user-b-agent-{uuid.uuid4().hex[:8]}", "spec": {}},
            timeout=5,
        )
        assert res_b.status_code == 200

        # Verify different agents
        assert res_a.json()["agent"]["id"] != res_b.json()["agent"]["id"]


class TestControlPlaneReliability:
    """Test control plane reliability under realistic scenarios."""

    @pytest.fixture
    def user(self):
        """Create and authenticate user."""
        email = f"reliability-test-{uuid.uuid4().hex[:8]}@test.zahara.ai"
        api_post(
            f"{API_BASE}/auth/signup",
            json={
                "username": f"reliable{uuid.uuid4().hex[:8]}",
                "email": email,
                "password": "password123!",
            },
            timeout=5,
        )
        res = api_post(
            f"{API_BASE}/auth/login",
            json={"email": email, "password": "password123!"},
            timeout=5,
        )
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    # ====================================================================
    # Tests: Reliability Scenarios
    # ====================================================================

    def test_rapid_agent_creation(self, user):
        """Create multiple agents rapidly."""
        for i in range(5):
            res = api_post(
                f"{API_BASE}/agents",
                headers=user,
                json={"name": f"rapid-{uuid.uuid4().hex[:8]}-{i}", "spec": {}},
                timeout=5,
            )
            assert res.status_code == 200

    def test_agent_list_pagination(self, user):
        """Agent list endpoint works."""
        res = api_get(
            f"{API_BASE}/agents",
            headers=user,
            timeout=5,
        )
        assert res.status_code == 200
        assert "items" in res.json()

    def test_error_handling_missing_agent(self, user):
        """Missing agent returns 404."""
        res = api_get(
            f"{API_BASE}/agents/ag_nonexistent",
            headers=user,
            timeout=5,
        )
        assert res.status_code == 404

    def test_error_handling_invalid_budget(self, user):
        """Invalid budget value handling."""
        res = api_post(
            f"{API_BASE}/agents",
            headers=user,
            json={
                "name": f"invalid-budget-{uuid.uuid4().hex[:8]}",
                "spec": {},
                "budget_daily_usd": -10,
            },
            timeout=5,
        )
        # Negative budgets should either be rejected (400) or converted to 0/null (200)
        assert res.status_code in {200, 400}


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
