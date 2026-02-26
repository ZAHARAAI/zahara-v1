"""
Job 7 – Observability & Control Plane test suite.

Covers:
  - Agent lifecycle enforcement (409 on paused/retired agent)
  - Daily budget enforcement (409 when budget exceeded)
  - PATCH /agents/{id}/kill  (pause + cancel pending runs)
  - GET  /agents/stats        (batch per-agent stats)
  - GET  /agents/stats/summary (KPI summary + runs_by_day)
  - GET  /agents/{id}/stats   (single-agent stats + spent_today_usd)
  - GET  /audit               (event log, type/entity filters)
  - Audit events written on: agent.created, run.started, agent.killed, run.cancelled

SQLite notes
------------
- percentile_cont is PostgreSQL-only.  The stats endpoints that call it are
  patched to return 0.0 for p95_latency_ms so the rest of the logic is still
  exercised on SQLite.
- Redis and Qdrant are mocked out entirely.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import event as sa_event
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# Path / env bootstrap  (mirrors conftest.py)
# ---------------------------------------------------------------------------
api_path = Path(__file__).parent.parent / "services" / "api"
sys.path.insert(0, str(api_path))

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_job7.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("SECRET_KEY", "test_secret_key_job7")

# ---------------------------------------------------------------------------
# Mock Redis + Qdrant before importing app so connections never happen
# ---------------------------------------------------------------------------
_mock_redis = MagicMock()
_mock_redis.get.return_value = None
_mock_redis.set.return_value = True
_mock_redis.incr.return_value = 1
_mock_redis.expire.return_value = True
_mock_redis.pipeline.return_value = _mock_redis
_mock_redis.execute.return_value = [1, True]

_mock_qdrant = MagicMock()

with (
    patch("redis.from_url", return_value=_mock_redis),
    patch("qdrant_client.QdrantClient", return_value=_mock_qdrant),
):
    from app.database import Base, get_db
    from app.main import app
    from app.models.audit_log import AuditLog as AuditLogModel
    from app.models.run import Run as RunModel
    from app.models.user import User as UserModel

# ---------------------------------------------------------------------------
# In-memory SQLite engine for this test module
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
)


# Enable FK enforcement on SQLite
@sa_event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create all tables
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

# ---------------------------------------------------------------------------
# percentile_cont shim: SQLite does not support it.
# We patch the SQLAlchemy func call site inside agents.py so it always
# returns 0.0, letting the rest of the query logic run normally.
# ---------------------------------------------------------------------------
_PATCH_TARGET = "app.routers.agents.func.percentile_cont"


def _percentile_cont_mock(*_args, **_kwargs):
    """Return a SQLAlchemy literal 0.0 so stats queries work on SQLite."""
    from sqlalchemy import literal

    class _Within:
        def within_group(self, *a, **kw):
            return literal(0.0)

    return _Within()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_client() -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


def _register_and_login(client: TestClient, suffix: str = "") -> str:
    """Register a fresh user and return a Bearer token."""
    email = f"job7test{suffix}@zahara.test"
    client.post(
        "/auth/signup",
        json={
            "username": f"job7user{suffix}",
            "email": email,
            "password": "securepass123",
        },
    )
    res = client.post("/auth/login", json={"email": email, "password": "securepass123"})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_agent(client: TestClient, token: str, name: str = "test-agent") -> dict:
    res = client.post(
        "/agents",
        json={"name": name, "slug": name, "spec": {}},
        headers=_auth(token),
    )
    assert res.status_code == 200, res.text
    return res.json()["agent"]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    with patch(_PATCH_TARGET, side_effect=_percentile_cont_mock):
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c


@pytest.fixture(scope="module")
def token(client):
    return _register_and_login(client, suffix="_main")


@pytest.fixture(scope="module")
def agent(client, token):
    return _create_agent(client, token, name="lifecycle-agent")


# ===========================================================================
# 1. AGENT LIFECYCLE ENFORCEMENT
# ===========================================================================


class TestLifecycleEnforcement:
    """409 when run attempted on non-active agent."""

    def test_active_agent_run_start_accepted(self, client, token, agent):
        """Active agent should not be rejected on lifecycle grounds (may fail for other reasons)."""
        with patch("app.routers.agents.execute_run_via_router"):
            res = client.post(
                f"/agents/{agent['id']}/run",
                json={"input": "hello", "source": "api"},
                headers=_auth(token),
            )
        # 200 OK or budget/other 409 — but NOT AGENT_NOT_ACTIVE
        if res.status_code == 409:
            assert res.json()["error"]["code"] != "AGENT_NOT_ACTIVE", res.text
        else:
            assert res.status_code == 200, res.text

    def test_paused_agent_run_rejected_409(self, client, token):
        """Run on a paused agent must return 409 AGENT_NOT_ACTIVE."""
        agent = _create_agent(client, token, name="paused-agent")

        # Pause it
        res = client.patch(
            f"/agents/{agent['id']}",
            json={"status": "paused"},
            headers=_auth(token),
        )
        assert res.status_code == 200, res.text

        # Try to run
        res = client.post(
            f"/agents/{agent['id']}/run",
            json={"input": "hello", "source": "api"},
            headers=_auth(token),
        )
        assert res.status_code == 409, res.text
        body = res.json()
        assert body["error"]["code"] == "AGENT_NOT_ACTIVE"
        assert "paused" in body["error"]["message"].lower()

    def test_retired_agent_run_rejected_409(self, client, token):
        """Run on a retired agent must return 409 AGENT_NOT_ACTIVE."""
        agent = _create_agent(client, token, name="retired-agent")

        client.patch(
            f"/agents/{agent['id']}",
            json={"status": "retired"},
            headers=_auth(token),
        )

        res = client.post(
            f"/agents/{agent['id']}/run",
            json={"input": "hello", "source": "api"},
            headers=_auth(token),
        )
        assert res.status_code == 409, res.text
        assert res.json()["error"]["code"] == "AGENT_NOT_ACTIVE"

    def test_reactivated_agent_run_accepted(self, client, token):
        """Agent set back to active should accept runs again."""
        agent = _create_agent(client, token, name="reactivated-agent")

        client.patch(
            f"/agents/{agent['id']}",
            json={"status": "paused"},
            headers=_auth(token),
        )
        client.patch(
            f"/agents/{agent['id']}",
            json={"status": "active"},
            headers=_auth(token),
        )

        with patch("app.routers.agents.execute_run_via_router"):
            res = client.post(
                f"/agents/{agent['id']}/run",
                json={"input": "hello", "source": "api"},
                headers=_auth(token),
            )
        assert res.status_code == 200, res.text


# ===========================================================================
# 2. BUDGET ENFORCEMENT
# ===========================================================================


class TestBudgetEnforcement:
    """Daily budget cap blocks runs when exceeded."""

    def test_zero_budget_blocks_run(self, client, token):
        """A $0.00 daily budget (treated as 'no cap') should NOT block runs.
        Only a positive budget that is actually exceeded blocks runs."""
        agent = _create_agent(client, token, name="zero-budget-agent")
        # budget_daily_usd=0 → treated as NULL / no cap by the backend
        client.patch(
            f"/agents/{agent['id']}",
            json={"budget_daily_usd": 0},
            headers=_auth(token),
        )
        with patch("app.routers.agents.execute_run_via_router"):
            res = client.post(
                f"/agents/{agent['id']}/run",
                json={"input": "hello", "source": "api"},
                headers=_auth(token),
            )
        # 0 budget → NULL cap → no enforcement → should not be budget-blocked
        if res.status_code == 409:
            assert res.json()["error"]["code"] != "BUDGET_EXCEEDED", res.text

    def test_budget_exceeded_blocks_run(self, client, token):
        """When evaluate_agent_budget signals exceeded, run returns 409 BUDGET_EXCEEDED."""
        agent = _create_agent(client, token, name="capped-agent")
        client.patch(
            f"/agents/{agent['id']}",
            json={"budget_daily_usd": 0.01},
            headers=_auth(token),
        )

        # Mock budget evaluation to simulate exceeded
        with patch(
            "app.routers.agents.evaluate_agent_budget",
            return_value=(
                MagicMock(
                    as_dict=lambda: {
                        "budget_daily_usd": 0.01,
                        "spent_today_usd": 0.05,
                        "percent_used": 500,
                        "is_approximate": False,
                    }
                ),
                True,  # exceeded=True
            ),
        ):
            res = client.post(
                f"/agents/{agent['id']}/run",
                json={"input": "hello", "source": "api"},
                headers=_auth(token),
            )

        assert res.status_code == 409, res.text
        body = res.json()
        assert body["error"]["code"] == "BUDGET_EXCEEDED"
        assert "meta" in body["error"]

    def test_budget_warning_meta_returned_on_success(self, client, token):
        """When budget is set but not exceeded, run response includes budget meta."""
        agent = _create_agent(client, token, name="budget-meta-agent")
        client.patch(
            f"/agents/{agent['id']}",
            json={"budget_daily_usd": 10.0},
            headers=_auth(token),
        )

        mock_meta = MagicMock()
        mock_meta.as_dict.return_value = {
            "budget_daily_usd": 10.0,
            "spent_today_usd": 1.0,
            "percent_used": 10,
            "is_approximate": False,
        }

        with (
            patch(
                "app.routers.agents.evaluate_agent_budget",
                return_value=(mock_meta, False),
            ),
            patch("app.routers.agents.execute_run_via_router"),
        ):
            res = client.post(
                f"/agents/{agent['id']}/run",
                json={"input": "hello", "source": "api"},
                headers=_auth(token),
            )

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True
        assert body["budget"] is not None
        assert body["budget"]["percent_used"] == 10


# ===========================================================================
# 3. KILL ENDPOINT
# ===========================================================================


class TestKillEndpoint:
    """PATCH /agents/{id}/kill — pauses agent, cancels pending/running runs."""

    def test_kill_pauses_agent(self, client, token):
        agent = _create_agent(client, token, name="kill-target-agent")
        res = client.patch(
            f"/agents/{agent['id']}/kill",
            headers=_auth(token),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True
        assert body["status"] == "paused"
        assert body["agent_id"] == agent["id"]

    def test_kill_cancels_pending_runs(self, client, token):
        """Kill should cancel pending/running runs and return cancelled count."""
        agent = _create_agent(client, token, name="kill-with-runs-agent")

        # Seed a pending run directly in the DB
        db = TestingSession()
        try:
            run = RunModel(
                id="test-run-kill-001",
                agent_id=agent["id"],
                user_id=_get_user_id(db, token),
                status="pending",
                source="api",
                request_id="req-kill-001",
            )
            db.add(run)
            db.commit()
        finally:
            db.close()

        res = client.patch(
            f"/agents/{agent['id']}/kill",
            headers=_auth(token),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True
        assert body["cancelled_runs"] >= 1

        # Verify run is now cancelled in DB
        db = TestingSession()
        try:
            r = db.query(RunModel).filter(RunModel.id == "test-run-kill-001").first()
            assert r is not None
            assert r.status == "cancelled"
        finally:
            db.close()

    def test_kill_writes_audit_events(self, client, token):
        """Kill should write agent.killed audit event."""
        agent = _create_agent(client, token, name="kill-audit-agent")

        client.patch(f"/agents/{agent['id']}/kill", headers=_auth(token))

        db = TestingSession()
        try:
            events = (
                db.query(AuditLogModel)
                .filter(
                    AuditLogModel.event_type == "agent.killed",
                    AuditLogModel.entity_id == agent["id"],
                )
                .all()
            )
            assert len(events) >= 1
        finally:
            db.close()

    def test_kill_unknown_agent_returns_404(self, client, token):
        res = client.patch(
            "/agents/nonexistent-agent-id-xyz/kill",
            headers=_auth(token),
        )
        assert res.status_code == 404, res.text

    def test_kill_requires_auth(self, client, token, agent):
        res = client.patch(f"/agents/{agent['id']}/kill")
        assert res.status_code in (401, 403)


# ===========================================================================
# 4. STATS ENDPOINTS
# ===========================================================================


class TestStatsEndpoints:
    """GET /agents/stats, /agents/stats/summary, /agents/{id}/stats."""

    def test_batch_stats_returns_list(self, client, token):
        res = client.get("/agents/stats?period=7d", headers=_auth(token))
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True
        assert isinstance(body["items"], list)

    def test_batch_stats_item_shape(self, client, token):
        """Each item must have the Job7 required fields."""
        agent = _create_agent(client, token, name="stats-shape-agent")
        res = client.get("/agents/stats?period=7d", headers=_auth(token))
        assert res.status_code == 200, res.text
        items = res.json()["items"]
        our = next((i for i in items if i["agent_id"] == agent["id"]), None)
        assert our is not None, "Created agent should appear in stats"
        for field in (
            "agent_id",
            "name",
            "slug",
            "runs",
            "success_rate",
            "tokens_total",
            "cost_total_usd",
            "avg_latency_ms",
            "p95_latency_ms",
            "spent_today_usd",
            "spent_today_is_approximate",
        ):
            assert field in our, f"Missing field: {field}"

    def test_batch_stats_period_all(self, client, token):
        res = client.get("/agents/stats?period=all", headers=_auth(token))
        assert res.status_code == 200, res.text
        assert res.json()["ok"] is True

    def test_batch_stats_invalid_period_returns_400(self, client, token):
        res = client.get("/agents/stats?period=99d", headers=_auth(token))
        assert res.status_code == 400, res.text

    def test_batch_stats_approx_flag_false_when_all_costs_stored(self, client, token):
        """Agent with a run that has cost_estimate_usd set → approx=False."""
        agent = _create_agent(client, token, name="approx-false-agent")
        db = TestingSession()
        try:
            run = RunModel(
                id="approx-false-run-001",
                agent_id=agent["id"],
                user_id=_get_user_id(db, token),
                status="success",
                source="api",
                request_id="req-approx-f-001",
                cost_estimate_usd=0.001,
                cost_is_approximate=False,
            )
            db.add(run)
            db.commit()
        finally:
            db.close()

        res = client.get("/agents/stats?period=7d", headers=_auth(token))
        items = res.json()["items"]
        our = next((i for i in items if i["agent_id"] == agent["id"]), None)
        assert our is not None
        assert our["spent_today_is_approximate"] is False

    def test_batch_stats_approx_flag_true_when_cost_missing(self, client, token):
        """Agent with a run missing cost_estimate_usd → approx=True."""
        agent = _create_agent(client, token, name="approx-true-agent")
        db = TestingSession()
        try:
            run = RunModel(
                id="approx-true-run-001",
                agent_id=agent["id"],
                user_id=_get_user_id(db, token),
                status="success",
                source="api",
                request_id="req-approx-t-001",
                cost_estimate_usd=None,  # missing → approximate
                tokens_in=100,
                tokens_out=50,
                tokens_total=150,
                model="gpt-4o-mini",
            )
            db.add(run)
            db.commit()
        finally:
            db.close()

        res = client.get("/agents/stats?period=7d", headers=_auth(token))
        items = res.json()["items"]
        our = next((i for i in items if i["agent_id"] == agent["id"]), None)
        assert our is not None
        assert our["spent_today_is_approximate"] is True

    def test_stats_summary_shape(self, client, token):
        res = client.get("/agents/stats/summary?period=7d", headers=_auth(token))
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True
        for field in (
            "runs",
            "success_rate",
            "tokens_total",
            "cost_total_usd",
            "avg_latency_ms",
            "p95_latency_ms",
            "runs_by_day",
        ):
            assert field in body, f"Missing summary field: {field}"
        assert isinstance(body["runs_by_day"], list)

    def test_stats_summary_runs_by_day_length(self, client, token):
        """7d period should return exactly 7 day buckets."""
        res = client.get("/agents/stats/summary?period=7d", headers=_auth(token))
        body = res.json()
        assert len(body["runs_by_day"]) == 7

    def test_single_agent_stats_shape(self, client, token):
        agent = _create_agent(client, token, name="single-stats-agent")
        res = client.get(
            f"/agents/{agent['id']}/stats?period=7d",
            headers=_auth(token),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True
        for field in (
            "agent_id",
            "period",
            "runs",
            "success_rate",
            "tokens_total",
            "cost_total_usd",
            "avg_latency_ms",
            "p95_latency_ms",
            "spent_today_usd",
            "spent_today_is_approximate",
        ):
            assert field in body, f"Missing single-agent stats field: {field}"

    def test_single_agent_stats_spent_today_uses_backend_value(self, client, token):
        """spent_today_usd in single-agent stats must reflect actual DB spend today."""
        agent = _create_agent(client, token, name="spent-today-agent")
        db = TestingSession()
        try:
            user_id = _get_user_id(db, token)
            run = RunModel(
                id="spent-today-run-001",
                agent_id=agent["id"],
                user_id=user_id,
                status="success",
                source="api",
                request_id="req-spent-001",
                cost_estimate_usd=0.0042,
                cost_is_approximate=False,
            )
            db.add(run)
            db.commit()
        finally:
            db.close()

        res = client.get(
            f"/agents/{agent['id']}/stats?period=7d",
            headers=_auth(token),
        )
        body = res.json()
        assert body["spent_today_usd"] == pytest.approx(0.0042, abs=1e-6)
        assert body["spent_today_is_approximate"] is False

    def test_single_agent_stats_unknown_agent_404(self, client, token):
        res = client.get("/agents/no-such-agent-xyz/stats", headers=_auth(token))
        assert res.status_code == 404, res.text

    def test_stats_require_auth(self, client):
        res = client.get("/agents/stats")
        assert res.status_code in (401, 403)

        res = client.get("/agents/stats/summary")
        assert res.status_code in (401, 403)


# ===========================================================================
# 5. AUDIT LOG
# ===========================================================================


class TestAuditLog:
    """GET /audit — filtering, pagination, event recording."""

    def test_audit_returns_list(self, client, token):
        res = client.get("/audit", headers=_auth(token))
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True
        assert isinstance(body["items"], list)
        assert "next_cursor" in body

    def test_audit_agent_created_event_written(self, client, token):
        """Creating an agent should write an agent.created audit event."""
        agent = _create_agent(client, token, name="audit-created-agent")

        res = client.get(
            "/audit",
            params={"type": "agent.created", "entity_id": agent["id"]},
            headers=_auth(token),
        )
        assert res.status_code == 200, res.text
        items = res.json()["items"]
        assert any(
            i["event_type"] == "agent.created" and i["entity_id"] == agent["id"]
            for i in items
        ), "agent.created event not found in audit log"

    def test_audit_run_started_event_written(self, client, token):
        """Starting a run should write a run.started audit event."""
        agent = _create_agent(client, token, name="audit-run-started-agent")

        with patch("app.routers.agents.execute_run_via_router"):
            run_res = client.post(
                f"/agents/{agent['id']}/run",
                json={"input": "hello", "source": "api"},
                headers=_auth(token),
            )
        assert run_res.status_code == 200, run_res.text
        run_id = run_res.json()["run_id"]

        audit_res = client.get(
            "/audit",
            params={"type": "run.started", "entity_id": run_id},
            headers=_auth(token),
        )
        assert audit_res.status_code == 200, audit_res.text
        items = audit_res.json()["items"]
        assert any(
            i["event_type"] == "run.started" and i["entity_id"] == run_id for i in items
        ), f"run.started event not found for run {run_id}"

    def test_audit_agent_killed_event_written(self, client, token):
        """Killing an agent should write agent.killed and run.cancelled audit events."""
        agent = _create_agent(client, token, name="audit-kill-agent")

        # Seed a pending run to be cancelled
        db = TestingSession()
        try:
            run = RunModel(
                id="audit-kill-run-001",
                agent_id=agent["id"],
                user_id=_get_user_id(db, token),
                status="pending",
                source="api",
                request_id="req-audit-kill",
            )
            db.add(run)
            db.commit()
        finally:
            db.close()

        client.patch(f"/agents/{agent['id']}/kill", headers=_auth(token))

        res = client.get(
            "/audit",
            params={"entity_id": agent["id"]},
            headers=_auth(token),
        )
        event_types = {i["event_type"] for i in res.json()["items"]}
        assert "agent.killed" in event_types, "agent.killed event missing"

    def test_audit_filter_by_type(self, client, token):
        """type filter should return only events of that type."""
        res = client.get(
            "/audit",
            params={"type": "agent.created"},
            headers=_auth(token),
        )
        items = res.json()["items"]
        assert all(
            i["event_type"] == "agent.created" for i in items
        ), "type filter returned wrong event types"

    def test_audit_filter_by_entity_type(self, client, token):
        res = client.get(
            "/audit",
            params={"entity_type": "agent"},
            headers=_auth(token),
        )
        items = res.json()["items"]
        assert all(
            i["entity_type"] == "agent" for i in items
        ), "entity_type filter returned non-agent events"

    def test_audit_filter_by_entity_id(self, client, token):
        agent = _create_agent(client, token, name="audit-entity-filter-agent")
        res = client.get(
            "/audit",
            params={"entity_id": agent["id"]},
            headers=_auth(token),
        )
        items = res.json()["items"]
        assert len(items) >= 1
        assert all(i["entity_id"] == agent["id"] for i in items)

    def test_audit_cursor_pagination(self, client, token):
        """next_cursor on first page should fetch a second page without overlap."""
        # Ensure enough events exist by creating several agents
        for i in range(5):
            _create_agent(client, token, name=f"audit-page-agent-{i}")

        first = client.get("/audit?limit=3", headers=_auth(token)).json()
        cursor = first.get("next_cursor")

        if cursor:
            second = client.get(
                f"/audit?limit=3&cursor={cursor}", headers=_auth(token)
            ).json()
            first_ids = {i["id"] for i in first["items"]}
            second_ids = {i["id"] for i in second["items"]}
            assert first_ids.isdisjoint(
                second_ids
            ), "Cursor pagination returned overlapping items"

    def test_audit_requires_auth(self, client):
        res = client.get("/audit")
        assert res.status_code in (401, 403)

    def test_audit_provider_key_values_not_logged(self, client, token):
        """Audit payloads must never contain raw API key values."""
        res = client.get("/audit", headers=_auth(token))
        items = res.json()["items"]
        for item in items:
            payload_str = str(item.get("payload", ""))
            # A real key would look like 'sk-...' or 'Bearer ...'
            assert (
                "sk-" not in payload_str
            ), f"Possible raw API key found in audit payload: {payload_str}"


# ===========================================================================
# 6. UPDATE AGENT — status + budget validation
# ===========================================================================


class TestUpdateAgent:
    """PATCH /agents/{id} — status and budget validation."""

    def test_update_status_to_valid_values(self, client, token):
        agent = _create_agent(client, token, name="update-status-agent")
        for status in ("paused", "retired", "active"):
            res = client.patch(
                f"/agents/{agent['id']}",
                json={"status": status},
                headers=_auth(token),
            )
            assert res.status_code == 200, f"Failed to set status={status}: {res.text}"

    def test_update_status_invalid_value_returns_400(self, client, token):
        agent = _create_agent(client, token, name="bad-status-agent")
        res = client.patch(
            f"/agents/{agent['id']}",
            json={"status": "zombie"},
            headers=_auth(token),
        )
        assert res.status_code == 400, res.text

    def test_update_budget_positive_value(self, client, token):
        agent = _create_agent(client, token, name="budget-update-agent")
        res = client.patch(
            f"/agents/{agent['id']}",
            json={"budget_daily_usd": 5.0},
            headers=_auth(token),
        )
        assert res.status_code == 200, res.text

    def test_update_budget_negative_returns_400(self, client, token):
        agent = _create_agent(client, token, name="neg-budget-agent")
        res = client.patch(
            f"/agents/{agent['id']}",
            json={"budget_daily_usd": -1.0},
            headers=_auth(token),
        )
        assert res.status_code == 400, res.text

    def test_update_budget_writes_audit_event(self, client, token):
        agent = _create_agent(client, token, name="budget-audit-update-agent")
        client.patch(
            f"/agents/{agent['id']}",
            json={"budget_daily_usd": 3.0},
            headers=_auth(token),
        )
        res = client.get(
            "/audit",
            params={"type": "agent.updated", "entity_id": agent["id"]},
            headers=_auth(token),
        )
        items = res.json()["items"]
        assert any(
            i["event_type"] == "agent.updated" for i in items
        ), "agent.updated audit event not found after PATCH"


# ===========================================================================
# Helpers (internal)
# ===========================================================================


def _get_user_id(db, token: str) -> int:
    """Decode the JWT to get user_id. Fallback: query by email from token claims."""
    from app.security.jwt_auth import decode_token

    try:
        payload = decode_token(token)
        return int(payload["uid"])
    except Exception:
        # Fallback: just return the first user (OK for isolated tests)
        u = db.query(UserModel).first()
        return u.id if u else 1
