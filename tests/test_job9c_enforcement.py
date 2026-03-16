"""
Job 9C Day 6 Enforcement Tests – Tool Allowlist and Runaway Protection

Tests for enforcement logic in run executor:
- Tool allowlist validation
- Runaway protection (max_steps, max_duration)
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, MagicMock

# Import the enforcement functions from run_executor
from services.api.app.services.run_executor import (
    _extract_tool_names,
    _check_tool_allowlist,
    _check_runaway_protection,
)
from services.api.app.models.agent import Agent as AgentModel


class TestToolAllowlistEnforcement:
    """Test tool allowlist enforcement functions."""

    def test_extract_tool_names_from_openai_format(self):
        """Extract tool names from OpenAI tool_calls format."""
        tool_calls = [
            {
                "id": "call_1",
                "type": "function",
                "function": {"name": "web_search", "arguments": "..."},
            },
            {
                "id": "call_2",
                "type": "function",
                "function": {"name": "calculator", "arguments": "..."},
            },
        ]
        names = _extract_tool_names(tool_calls)
        assert names == ["web_search", "calculator"]

    def test_extract_tool_names_from_simple_format(self):
        """Extract tool names from simple format."""
        tool_calls = [{"name": "email"}, {"name": "web_search"}]
        names = _extract_tool_names(tool_calls)
        assert names == ["email", "web_search"]

    def test_extract_tool_names_empty_list(self):
        """Extract tool names from empty list."""
        assert _extract_tool_names([]) == []

    def test_extract_tool_names_invalid_input(self):
        """Extract tool names from invalid input."""
        assert _extract_tool_names("not_a_list") == []
        assert _extract_tool_names(None) == []
        assert _extract_tool_names({}) == []

    def test_check_allowlist_null_denies_by_default(self):
        """Null allowlist denies tools when legacy flag is off (default)."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = None

        allowed, error = _check_tool_allowlist(agent, ["web_search", "calculator"])
        assert allowed is False
        assert "deny-by-default" in error.lower()

    def test_check_allowlist_null_allows_no_tool_calls(self):
        """Null allowlist allows calls with no tools even when deny-by-default."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = None

        allowed, error = _check_tool_allowlist(agent, [])
        assert allowed is True
        assert error is None

    def test_check_allowlist_null_allows_all_when_legacy_open(self):
        """Null allowlist allows all tools when TOOL_GOVERNANCE_LEGACY_OPEN=true."""
        from unittest.mock import patch as _patch
        with _patch("services.api.app.services.run_executor.settings") as mock_settings:
            mock_settings.tool_governance_legacy_open = True
            agent = Mock(spec=AgentModel)
            agent.tool_allowlist = None

            allowed, error = _check_tool_allowlist(agent, ["web_search", "calculator"])
            assert allowed is True
            assert error is None

    def test_check_allowlist_empty_blocks_all_tools(self):
        """Empty allowlist blocks all tools."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = []

        allowed, error = _check_tool_allowlist(agent, ["web_search"])
        assert allowed is False
        assert "empty tool allowlist" in error.lower()

    def test_check_allowlist_empty_allows_no_tools(self):
        """Empty allowlist allows calls with no tools."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = []

        allowed, error = _check_tool_allowlist(agent, [])
        assert allowed is True
        assert error is None

    def test_check_allowlist_allows_permitted_tools(self):
        """Allowlist allows tools in the list."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = ["web_search", "calculator", "email"]

        allowed, error = _check_tool_allowlist(
            agent, ["web_search", "calculator"]
        )
        assert allowed is True
        assert error is None

    def test_check_allowlist_blocks_unpermitted_tools(self):
        """Allowlist blocks tools not in the list."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = ["web_search", "calculator"]

        allowed, error = _check_tool_allowlist(agent, ["web_search", "email"])
        assert allowed is False
        assert "email" in error.lower()
        assert "not allowed" in error.lower()

    def test_check_allowlist_partial_block(self):
        """Allowlist blocks when any tool is not permitted."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = ["web_search"]

        allowed, error = _check_tool_allowlist(
            agent, ["web_search", "calculator", "email"]
        )
        assert allowed is False
        assert "calculator" in error.lower() or "email" in error.lower()

    def test_check_allowlist_case_sensitive(self):
        """Tool name matching is case-sensitive."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = ["web_search"]

        allowed, error = _check_tool_allowlist(agent, ["Web_Search"])
        assert allowed is False


class TestRunawayProtectionEnforcement:
    """Test runaway protection enforcement functions."""

    def test_check_runaway_no_limits(self):
        """No limits allows unlimited runs."""
        agent = Mock(spec=AgentModel)
        agent.max_steps_per_run = None
        agent.max_duration_seconds_per_run = None

        run = Mock()
        run.created_at = datetime.now(timezone.utc) - timedelta(hours=1)

        current_time = datetime.now(timezone.utc)
        within_limits, error = _check_runaway_protection(agent, run, current_time)
        assert within_limits is True
        assert error is None

    def test_check_runaway_zero_limits_ignored(self):
        """Zero limits are treated as "no limit"."""
        agent = Mock(spec=AgentModel)
        agent.max_steps_per_run = 0
        agent.max_duration_seconds_per_run = 0

        run = Mock()
        run.created_at = datetime.now(timezone.utc) - timedelta(hours=1)

        current_time = datetime.now(timezone.utc)
        within_limits, error = _check_runaway_protection(agent, run, current_time)
        assert within_limits is True
        assert error is None

    def test_check_runaway_duration_within_limit(self):
        """Duration within limit is allowed."""
        agent = Mock(spec=AgentModel)
        agent.max_steps_per_run = None
        agent.max_duration_seconds_per_run = 300  # 5 minutes

        run = Mock()
        run.created_at = datetime.now(timezone.utc) - timedelta(seconds=100)

        current_time = datetime.now(timezone.utc)
        within_limits, error = _check_runaway_protection(agent, run, current_time)
        assert within_limits is True
        assert error is None

    def test_check_runaway_duration_exceeds_limit(self):
        """Duration exceeding limit is blocked."""
        agent = Mock(spec=AgentModel)
        agent.max_steps_per_run = None
        agent.max_duration_seconds_per_run = 300  # 5 minutes

        run = Mock()
        run.created_at = datetime.now(timezone.utc) - timedelta(seconds=400)

        current_time = datetime.now(timezone.utc)
        within_limits, error = _check_runaway_protection(agent, run, current_time)
        assert within_limits is False
        assert "exceeded" in error.lower()
        assert "duration" in error.lower()

    def test_check_runaway_duration_at_limit(self):
        """Duration just under limit is allowed."""
        agent = Mock(spec=AgentModel)
        agent.max_steps_per_run = None
        agent.max_duration_seconds_per_run = 300  # 5 minutes

        run = Mock()
        run.created_at = datetime.now(timezone.utc) - timedelta(seconds=299)

        current_time = datetime.now(timezone.utc)
        within_limits, error = _check_runaway_protection(agent, run, current_time)
        # Just under limit should be allowed
        assert within_limits is True


class TestEnforcementIntegration:
    """Integration tests for enforcement combinations."""

    def test_strict_allowlist_with_duration_limit(self):
        """Combine strict allowlist with duration limits."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = ["web_search"]
        agent.max_steps_per_run = None
        agent.max_duration_seconds_per_run = 60

        # Tool check
        allowed, error = _check_tool_allowlist(agent, ["web_search"])
        assert allowed is True

        # Duration check
        run = Mock()
        run.created_at = datetime.now(timezone.utc) - timedelta(seconds=30)
        current_time = datetime.now(timezone.utc)
        within_limits, error = _check_runaway_protection(agent, run, current_time)
        assert within_limits is True

    def test_no_tools_with_strict_limits(self):
        """Agent with empty allowlist and strict duration."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = []
        agent.max_steps_per_run = None
        agent.max_duration_seconds_per_run = 10

        # No tools allowed
        allowed, error = _check_tool_allowlist(agent, ["calculator"])
        assert allowed is False

        # Duration still monitored
        run = Mock()
        run.created_at = datetime.now(timezone.utc) - timedelta(seconds=5)
        current_time = datetime.now(timezone.utc)
        within_limits, error = _check_runaway_protection(agent, run, current_time)
        assert within_limits is True

    def test_permissive_allowlist_with_duration_limit(self):
        """Permissive (large) allowlist with duration limit."""
        agent = Mock(spec=AgentModel)
        agent.tool_allowlist = ["web_search", "calculator", "email", "calendar"]
        agent.max_steps_per_run = None
        agent.max_duration_seconds_per_run = 60

        # Multiple tools allowed
        allowed, error = _check_tool_allowlist(
            agent, ["web_search", "email"]
        )
        assert allowed is True

        # Duration still enforced
        run = Mock()
        run.created_at = datetime.now(timezone.utc) - timedelta(seconds=70)
        current_time = datetime.now(timezone.utc)
        within_limits, error = _check_runaway_protection(agent, run, current_time)
        assert within_limits is False


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
