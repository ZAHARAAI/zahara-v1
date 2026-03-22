"""
Job 9C Tests – Auth Enforcement + User Data Isolation

Covers:
  - JWT auth requirement on protected endpoints
  - User scoping: User A cannot access User B resources
  - 404 on non-owned resources (no existence leak)
  - Idempotency-Key deduplication
  - Run event ordering and persistence
  - Event scoping by user/agent/run
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import event as sa_event
from sqlalchemy.orm import sessionmaker

# Path setup
api_path = Path(__file__).parent.parent / "services" / "api"
sys.path.insert(0, str(api_path))

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_job9c.db")
os.environ.setdefault("SECRET_KEY", "test_secret_key_job9c")

# Mock Redis/Qdrant before app import
from unittest.mock import MagicMock, patch

_mock_redis = MagicMock()
_mock_redis.get.return_value = None
_mock_redis.set.return_value = True
_mock_redis.incr.return_value = 1

_mock_qdrant = MagicMock()

with (
    patch("redis.from_url", return_value=_mock_redis),
    patch("qdrant_client.QdrantClient", return_value=_mock_qdrant),
):
    from app.database import Base, get_db
    from app.main import app

from sqlalchemy.pool import StaticPool

# In-memory SQLite
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@sa_event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# JSONB -> JSON shim for SQLite
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


# Strip PG-specific server defaults
_saved_defaults = []
for _table in Base.metadata.tables.values():
    for _col in _table.columns:
        if _col.server_default is not None:
            try:
                _expr = str(getattr(_col.server_default, "arg", ""))
                if "::" in _expr or "gen_random_uuid" in _expr:
                    _saved_defaults.append((_col, _col.server_default))
                    _col.server_default = None
            except Exception:
                pass

Base.metadata.create_all(bind=engine)

for _col, _sd in _saved_defaults:
    _col.server_default = _sd


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture(scope="module", autouse=True)
def _setup_db_override():
    """Set and restore DB override for this module."""
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(scope="module")
def client(_setup_db_override):
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture
def user_a_token(client):
    """Register and login User A."""
    email = "user-a@test.zahara.ai"
    client.post(
        "/auth/signup",
        json={
            "username": "userA",
            "email": email,
            "password": "password123!",
        },
    )
    res = client.post("/auth/login", json={"email": email, "password": "password123!"})
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.fixture
def user_b_token(client):
    """Register and login User B."""
    email = "user-b@test.zahara.ai"
    client.post(
        "/auth/signup",
        json={
            "username": "userB",
            "email": email,
            "password": "password456!",
        },
    )
    res = client.post("/auth/login", json={"email": email, "password": "password456!"})
    assert res.status_code == 200
    return res.json()["access_token"]


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_agent(client: TestClient, token: str, name: str = "test-agent") -> str:
    """Create an agent and return its ID."""
    res = client.post(
        "/agents",
        headers=_auth_header(token),
        json={"name": name, "description": f"Agent {name}", "spec": {}},
    )
    assert res.status_code == 200, res.text
    return res.json()["agent"]["id"]


def _start_run(
    client: TestClient, token: str, agent_id: str, idempotency_key: str = None
) -> dict:
    """Start a run and return response JSON."""
    headers = _auth_header(token)
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    res = client.post(
        f"/agents/{agent_id}/run",
        headers=headers,
        json={"input": "test input", "source": "test"},
    )
    assert res.status_code == 200, res.text
    return res.json()


# ============================================================================
# Test Suite: JWT Auth Enforcement
# ============================================================================


class TestJWTAuthEnforcement:
    """Protected endpoints require valid JWT token."""

    def test_get_agents_requires_auth(self, client):
        """GET /agents without token returns 401."""
        res = client.get("/agents")
        assert res.status_code == 401
        assert "Authorization" in res.json()["detail"]

    def test_get_agents_invalid_token_returns_401(self, client):
        """GET /agents with invalid token returns 401."""
        res = client.get("/agents", headers=_auth_header("invalid-token"))
        assert res.status_code == 401

    def test_create_agent_requires_auth(self, client):
        """POST /agents without token returns 401."""
        res = client.post("/agents", json={"name": "test", "spec": {}})
        assert res.status_code == 401

    def test_start_run_requires_auth(self, client, user_a_token):
        """POST /agents/{id}/run without token returns 401."""
        agent_id = _create_agent(client, user_a_token)
        res = client.post(f"/agents/{agent_id}/run", json={"input": "test"})
        assert res.status_code == 401

    def test_list_runs_requires_auth(self, client):
        """GET /runs without token returns 401."""
        res = client.get("/runs")
        assert res.status_code == 401

    def test_get_run_requires_auth(self, client, user_a_token):
        """GET /runs/{id} without token returns 401."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]
        res = client.get(f"/runs/{run_id}")
        assert res.status_code == 401


# ============================================================================
# Test Suite: User Data Isolation (Scoping)
# ============================================================================


class TestUserDataIsolation:
    """User A cannot access User B's agents/runs/events."""

    def test_user_a_creates_agent(self, client, user_a_token):
        """User A can create and see their own agent."""
        agent_id = _create_agent(client, user_a_token, "agent-a")
        res = client.get(f"/agents/{agent_id}", headers=_auth_header(user_a_token))
        assert res.status_code == 200
        assert res.json()["agent"]["id"] == agent_id

    def test_user_b_cannot_see_user_a_agent(self, client, user_a_token, user_b_token):
        """User B gets 404 when accessing User A's agent."""
        agent_id = _create_agent(client, user_a_token, "agent-a")
        res = client.get(f"/agents/{agent_id}", headers=_auth_header(user_b_token))
        assert res.status_code == 404
        body = res.json()
        assert "not found" in (body.get("error") or body.get("detail") or "").lower()

    def test_user_b_agent_list_empty_if_none_created(self, client, user_b_token):
        """User B's agent list only shows their agents (empty if none created)."""
        res = client.get("/agents", headers=_auth_header(user_b_token))
        assert res.status_code == 200
        assert len(res.json()["items"]) == 0

    def test_user_a_starts_run(self, client, user_a_token):
        """User A can start and see their own runs."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        res = client.get(f"/runs/{run_id}", headers=_auth_header(user_a_token))
        assert res.status_code == 200
        assert res.json()["run"]["id"] == run_id

    def test_user_b_cannot_see_user_a_run(self, client, user_a_token, user_b_token):
        """User B gets 404 when accessing User A's run."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        res = client.get(f"/runs/{run_id}", headers=_auth_header(user_b_token))
        assert res.status_code == 404

    def test_user_b_run_list_empty_if_none_started(self, client, user_b_token):
        """User B's run list is empty if they haven't started any runs."""
        res = client.get("/runs", headers=_auth_header(user_b_token))
        assert res.status_code == 200
        assert len(res.json()["items"]) == 0

    def test_user_a_cannot_update_user_b_agent(
        self, client, user_a_token, user_b_token
    ):
        """User A cannot update User B's agent (404)."""
        agent_id = _create_agent(client, user_b_token, "agent-b")
        res = client.patch(
            f"/agents/{agent_id}",
            headers=_auth_header(user_a_token),
            json={"name": "hacked"},
        )
        assert res.status_code == 404

    def test_user_a_cannot_cancel_user_b_run(
        self, client, user_a_token, user_b_token
    ):
        """User A cannot cancel User B's run (404)."""
        agent_id = _create_agent(client, user_b_token)
        run_data = _start_run(client, user_b_token, agent_id)
        run_id = run_data["run_id"]

        res = client.post(
            f"/runs/{run_id}/cancel", headers=_auth_header(user_a_token)
        )
        assert res.status_code == 404


# ============================================================================
# Test Suite: Idempotency-Key
# ============================================================================


class TestIdempotencyKey:
    """Duplicate runs prevented via Idempotency-Key."""

    def test_same_idempotency_key_returns_same_run(
        self, client, user_a_token
    ):
        """Sending same Idempotency-Key twice returns the same run_id."""
        agent_id = _create_agent(client, user_a_token)
        idempotency_key = "test-key-12345"

        res1 = _start_run(client, user_a_token, agent_id, idempotency_key)
        run_id_1 = res1["run_id"]

        res2 = _start_run(client, user_a_token, agent_id, idempotency_key)
        run_id_2 = res2["run_id"]

        assert run_id_1 == run_id_2, "Same Idempotency-Key should return same run"

    def test_different_idempotency_keys_create_different_runs(
        self, client, user_a_token
    ):
        """Different Idempotency-Keys create different runs."""
        agent_id = _create_agent(client, user_a_token)

        res1 = _start_run(client, user_a_token, agent_id, "key-1")
        run_id_1 = res1["run_id"]

        res2 = _start_run(client, user_a_token, agent_id, "key-2")
        run_id_2 = res2["run_id"]

        assert run_id_1 != run_id_2, "Different keys should create different runs"

    def test_idempotency_key_scoped_by_user(self, client, user_a_token, user_b_token):
        """Same Idempotency-Key by different users creates different runs."""
        agent_a = _create_agent(client, user_a_token, "agent-a")
        agent_b = _create_agent(client, user_b_token, "agent-b")
        key = "shared-key"

        res_a = _start_run(client, user_a_token, agent_a, key)
        res_b = _start_run(client, user_b_token, agent_b, key)

        assert res_a["run_id"] != res_b["run_id"], "Same key across users should differ"


# ============================================================================
# Test Suite: Run Events + Ordering
# ============================================================================


class TestRunEventsAndOrdering:
    """Run events persist, ordered, and are scoped by user."""

    def test_run_events_endpoint_returns_events(self, client, user_a_token):
        """GET /runs/{id}/events returns event list."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        res = client.get(f"/runs/{run_id}/events", headers=_auth_header(user_a_token))
        assert res.status_code == 200
        body = res.json()
        assert "events" in body
        assert isinstance(body["events"], list)

    def test_run_has_system_event_on_creation(self, client, user_a_token):
        """Run creation generates a 'system' event."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        res = client.get(f"/runs/{run_id}/events", headers=_auth_header(user_a_token))
        events = res.json()["events"]
        assert len(events) > 0
        # First event should be 'system' (run_created)
        assert events[0]["type"] == "system"

    def test_events_are_ordered_chronologically(self, client, user_a_token):
        """Events are ordered by creation time."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        res = client.get(f"/runs/{run_id}/events", headers=_auth_header(user_a_token))
        events = res.json()["events"]

        # Verify timestamps are in order
        if len(events) > 1:
            for i in range(len(events) - 1):
                ts1 = events[i]["created_at"]
                ts2 = events[i + 1]["created_at"]
                # Compare ISO timestamps lexicographically
                assert ts1 <= ts2, f"Events not ordered: {ts1} > {ts2}"

    def test_user_b_cannot_access_user_a_events(
        self, client, user_a_token, user_b_token
    ):
        """User B cannot access User A's run events (404)."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        res = client.get(f"/runs/{run_id}/events", headers=_auth_header(user_b_token))
        assert res.status_code == 404


# ============================================================================
# Test Suite: Stream Endpoint (SSE)
# ============================================================================


class TestStreamEndpoint:
    """GET /runs/{id}/stream provides SSE with heartbeat + Last-Event-ID."""

    def test_stream_endpoint_requires_auth(self, client, user_a_token):
        """GET /runs/{id}/stream without auth returns 401."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        res = client.get(f"/runs/{run_id}/stream")
        assert res.status_code == 401

    def test_stream_scoped_by_user(self, client, user_a_token, user_b_token):
        """User B cannot stream User A's run events."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        res = client.get(
            f"/runs/{run_id}/stream", headers=_auth_header(user_b_token)
        )
        assert res.status_code == 404

    def test_stream_returns_text_event_stream(self, client, user_a_token):
        """GET /runs/{id}/stream returns text/event-stream."""
        agent_id = _create_agent(client, user_a_token)
        run_data = _start_run(client, user_a_token, agent_id)
        run_id = run_data["run_id"]

        # Mark run as terminal so the stream generator exits promptly
        db = TestingSession()
        try:
            from app.models.run import Run as _RM
            db.query(_RM).filter(_RM.id == run_id).update({"status": "success"})
            db.commit()
        finally:
            db.close()

        # Patch SessionLocal used inside the SSE generator to use the test engine
        with patch("app.routers.run.SessionLocal", TestingSession):
            res = client.get(f"/runs/{run_id}/stream", headers=_auth_header(user_a_token))
        assert res.status_code == 200
        assert "text/event-stream" in res.headers.get("content-type", "")
