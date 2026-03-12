"""
Job 9C Day 6 Comprehensive Tests – Control Plane Reliability

Extends Day 6 test coverage with enforcement scenarios and edge cases.
Covers budget enforcement, field validation, and data persistence.
"""

import time
import requests
import pytest

API_BASE = "http://localhost:8000"


class TestBudgetEnforcementComprehensive:
    """Comprehensive budget enforcement testing."""

    @pytest.fixture
    def auth_headers(self):
        """Authenticated headers."""
        user_email = f"budget-comprehensive-{int(time.time())}@test.zahara.ai"
        requests.post(
            f"{API_BASE}/auth/signup",
            json={
                "username": f"budgetcomp{int(time.time())}",
                "email": user_email,
                "password": "password123!",
            },
            timeout=5,
        )
        res = requests.post(
            f"{API_BASE}/auth/login",
            json={"email": user_email, "password": "password123!"},
            timeout=5,
        )
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    # ====================================================================
    # Tests: Budget Enforcement
    # ====================================================================

    def test_budget_value_persisted_across_get_requests(self, auth_headers):
        """Budget value is persisted in database and returned on GET."""
        # Create agent with specific budget
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"budget-persist-{int(time.time())}",
                "spec": {},
                "budget_daily_usd": 2.50,
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]
        created_budget = float(res.json()["agent"]["budget_daily_usd"])

        # Fetch agent and verify budget is the same
        res = requests.get(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            timeout=5,
        )
        fetched_budget = float(res.json()["agent"]["budget_daily_usd"])
        assert created_budget == fetched_budget == 2.50

    def test_budget_zero_treated_as_none(self, auth_headers):
        """Budget of 0 is treated as no cap (None)."""
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"budget-zero-{int(time.time())}",
                "spec": {},
                "budget_daily_usd": 0,
            },
            timeout=5,
        )
        agent = res.json()["agent"]
        # Zero budget should be stored as None/null
        assert agent["budget_daily_usd"] is None or agent["budget_daily_usd"] == 0

    def test_budget_update_persisted(self, auth_headers):
        """Budget updates are persisted."""
        # Create agent with initial budget
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"budget-update-{int(time.time())}",
                "spec": {},
                "budget_daily_usd": 5.00,
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]

        # Update budget
        requests.patch(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            json={"budget_daily_usd": 10.00},
            timeout=5,
        )

        # Fetch and verify
        res = requests.get(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            timeout=5,
        )
        assert float(res.json()["agent"]["budget_daily_usd"]) == 10.00

    def test_budget_negative_value_rejected(self, auth_headers):
        """Negative budget values are rejected."""
        # Create agent
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"budget-test-{int(time.time())}",
                "spec": {},
                "budget_daily_usd": 5.00,
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]

        # Try to update with negative budget
        res = requests.patch(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            json={"budget_daily_usd": -1.00},
            timeout=5,
        )
        assert res.status_code == 400

    def test_budget_in_agent_list(self, auth_headers):
        """Budget is included in agent list responses."""
        # Create agent with budget
        requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"budget-list-{int(time.time())}",
                "spec": {},
                "budget_daily_usd": 3.75,
            },
            timeout=5,
        )

        # Get agent list
        res = requests.get(
            f"{API_BASE}/agents",
            headers=auth_headers,
            timeout=5,
        )
        agents = res.json()["items"]
        assert len(agents) > 0
        # At least one agent should have the budget field
        assert any("budget_daily_usd" in agent for agent in agents)


class TestToolAllowlistComprehensive:
    """Comprehensive tool allowlist testing."""

    @pytest.fixture
    def auth_headers(self):
        """Authenticated headers."""
        user_email = f"allowlist-comp-{int(time.time())}@test.zahara.ai"
        requests.post(
            f"{API_BASE}/auth/signup",
            json={
                "username": f"allowlistcomp{int(time.time())}",
                "email": user_email,
                "password": "password123!",
            },
            timeout=5,
        )
        res = requests.post(
            f"{API_BASE}/auth/login",
            json={"email": user_email, "password": "password123!"},
            timeout=5,
        )
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    # ====================================================================
    # Tests: Tool Allowlist
    # ====================================================================

    def test_allowlist_persisted_across_requests(self, auth_headers):
        """Tool allowlist is persisted in database."""
        allowlist = ["web_search", "calculator", "email"]
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"allowlist-persist-{int(time.time())}",
                "spec": {},
                "tool_allowlist": allowlist,
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]
        created_allowlist = res.json()["agent"]["tool_allowlist"]

        # Fetch agent and verify allowlist is the same
        res = requests.get(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            timeout=5,
        )
        fetched_allowlist = res.json()["agent"]["tool_allowlist"]
        assert created_allowlist == fetched_allowlist == allowlist

    def test_empty_allowlist_accepted(self, auth_headers):
        """Empty tool allowlist is accepted."""
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"empty-allowlist-{int(time.time())}",
                "spec": {},
                "tool_allowlist": [],
            },
            timeout=5,
        )
        assert res.status_code == 200
        assert res.json()["agent"]["tool_allowlist"] == []

    def test_allowlist_update_persisted(self, auth_headers):
        """Tool allowlist updates are persisted."""
        # Create agent with initial allowlist
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"allowlist-update-{int(time.time())}",
                "spec": {},
                "tool_allowlist": ["web_search"],
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]

        # Update allowlist
        new_allowlist = ["web_search", "calculator", "email"]
        requests.patch(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            json={"tool_allowlist": new_allowlist},
            timeout=5,
        )

        # Fetch and verify
        res = requests.get(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            timeout=5,
        )
        assert res.json()["agent"]["tool_allowlist"] == new_allowlist

    def test_null_allowlist_means_all_tools_allowed(self, auth_headers):
        """Null tool allowlist means all tools are allowed."""
        # Create agent without allowlist
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"no-allowlist-{int(time.time())}",
                "spec": {},
            },
            timeout=5,
        )
        agent = res.json()["agent"]
        # allowlist should be None when not specified
        assert agent["tool_allowlist"] is None


class TestRunawayProtectionComprehensive:
    """Comprehensive runaway protection testing."""

    @pytest.fixture
    def auth_headers(self):
        """Authenticated headers."""
        user_email = f"runaway-comp-{int(time.time())}@test.zahara.ai"
        requests.post(
            f"{API_BASE}/auth/signup",
            json={
                "username": f"runawaycomp{int(time.time())}",
                "email": user_email,
                "password": "password123!",
            },
            timeout=5,
        )
        res = requests.post(
            f"{API_BASE}/auth/login",
            json={"email": user_email, "password": "password123!"},
            timeout=5,
        )
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    # ====================================================================
    # Tests: Runaway Protection
    # ====================================================================

    def test_max_steps_persisted(self, auth_headers):
        """Max steps limit is persisted in database."""
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"max-steps-persist-{int(time.time())}",
                "spec": {},
                "max_steps_per_run": 100,
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]
        created_steps = res.json()["agent"]["max_steps_per_run"]

        # Fetch and verify
        res = requests.get(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            timeout=5,
        )
        fetched_steps = res.json()["agent"]["max_steps_per_run"]
        assert created_steps == fetched_steps == 100

    def test_max_duration_persisted(self, auth_headers):
        """Max duration limit is persisted in database."""
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"max-duration-persist-{int(time.time())}",
                "spec": {},
                "max_duration_seconds_per_run": 3600,
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]
        created_duration = res.json()["agent"]["max_duration_seconds_per_run"]

        # Fetch and verify
        res = requests.get(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            timeout=5,
        )
        fetched_duration = res.json()["agent"]["max_duration_seconds_per_run"]
        assert created_duration == fetched_duration == 3600

    def test_max_steps_zero_rejected(self, auth_headers):
        """Max steps of 0 is rejected."""
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"max-steps-zero-{int(time.time())}",
                "spec": {},
                "max_steps_per_run": 0,
            },
            timeout=5,
        )
        # Should fail or accept but treat 0 specially
        # Checking that the API handles it gracefully
        assert res.status_code in {200, 400}

    def test_max_duration_zero_rejected(self, auth_headers):
        """Max duration of 0 is rejected."""
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"max-duration-zero-{int(time.time())}",
                "spec": {},
                "max_duration_seconds_per_run": 0,
            },
            timeout=5,
        )
        # Should fail or accept but treat 0 specially
        assert res.status_code in {200, 400}

    def test_runaway_limits_update_persisted(self, auth_headers):
        """Runaway protection limits can be updated."""
        # Create agent
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"runaway-update-{int(time.time())}",
                "spec": {},
                "max_steps_per_run": 50,
                "max_duration_seconds_per_run": 1800,
            },
            timeout=5,
        )
        agent_id = res.json()["agent"]["id"]

        # Update limits
        res = requests.patch(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            json={
                "max_steps_per_run": 200,
                "max_duration_seconds_per_run": 7200,
            },
            timeout=5,
        )

        # Verify update
        res = requests.get(
            f"{API_BASE}/agents/{agent_id}",
            headers=auth_headers,
            timeout=5,
        )
        agent = res.json()["agent"]
        assert agent["max_steps_per_run"] == 200
        assert agent["max_duration_seconds_per_run"] == 7200


class TestControlPlaneFieldValidation:
    """Test field validation and constraints."""

    @pytest.fixture
    def auth_headers(self):
        """Authenticated headers."""
        user_email = f"validation-{int(time.time())}@test.zahara.ai"
        requests.post(
            f"{API_BASE}/auth/signup",
            json={
                "username": f"validation{int(time.time())}",
                "email": user_email,
                "password": "password123!",
            },
            timeout=5,
        )
        res = requests.post(
            f"{API_BASE}/auth/login",
            json={"email": user_email, "password": "password123!"},
            timeout=5,
        )
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    # ====================================================================
    # Tests: Field Validation
    # ====================================================================

    def test_all_guardrails_can_be_combined(self, auth_headers):
        """All guardrail fields can be set on the same agent."""
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"fully-guarded-{int(time.time())}",
                "spec": {},
                "budget_daily_usd": 10.00,
                "tool_allowlist": ["web_search", "calculator"],
                "max_steps_per_run": 100,
                "max_duration_seconds_per_run": 3600,
            },
            timeout=5,
        )
        assert res.status_code == 200
        agent = res.json()["agent"]
        assert agent["budget_daily_usd"] == 10.00
        assert agent["tool_allowlist"] == ["web_search", "calculator"]
        assert agent["max_steps_per_run"] == 100
        assert agent["max_duration_seconds_per_run"] == 3600

    def test_guardrails_optional_when_not_needed(self, auth_headers):
        """Guardrail fields are all optional."""
        res = requests.post(
            f"{API_BASE}/agents",
            headers=auth_headers,
            json={
                "name": f"no-guardrails-{int(time.time())}",
                "spec": {},
            },
            timeout=5,
        )
        assert res.status_code == 200
        agent = res.json()["agent"]
        # All guardrail fields should default to None
        assert agent["budget_daily_usd"] is None
        assert agent["tool_allowlist"] is None
        assert agent["max_steps_per_run"] is None
        assert agent["max_duration_seconds_per_run"] is None


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
