"""
SSE micro-test: Job 9C sprint acceptance criteria.

Covers:
  - Monotonic seq per run (strictly increasing, 1-based)
  - Reconnect via ?cursor= replays missed events
  - Reconnect via Last-Event-ID header replays missed events
  - Disconnect/reconnect simulation with seq continuity verification
  - Heartbeat emitted as SSE comment (no seq consumed, not a data event)
  - /runs/{id}/stream alias works identically to /runs/{id}/events
  - Response headers: Cache-Control, X-Accel-Buffering, content-type

SQLite notes
------------
- StaticPool ensures the in-memory database is shared across all sessions
  (dependency-injected and those opened inside the SSE generator loop).
- FOR UPDATE is skipped automatically on SQLite by append_run_event().
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# Path / env bootstrap (mirrors conftest.py)
# ---------------------------------------------------------------------------
api_path = Path(__file__).parent.parent / "services" / "api"
sys.path.insert(0, str(api_path))

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("SECRET_KEY", "test_secret_sse")

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
    from app.models.run import Run as RunModel
    from app.models.run_event import RunEvent as RunEventModel
    from app.models.user import User as UserModel

# ---------------------------------------------------------------------------
# JSONB -> JSON shim for SQLite (audit_log and agent_specs use JSONB)
# ---------------------------------------------------------------------------
from sqlalchemy.dialects.postgresql import JSONB


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"

# ---------------------------------------------------------------------------
# In-memory SQLite engine (StaticPool so all sessions -- including those
# opened by SessionLocal() inside the SSE generator -- share one connection)
# ---------------------------------------------------------------------------
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@sa_event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Temporarily strip PostgreSQL-specific server defaults that break SQLite DDL
# (e.g. gen_random_uuid()::text). Restore them after create_all so the shared
# metadata stays correct for any other test modules in the same process.
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


def _override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
RUN_ID = "run_ssetest000001"
USER_ID = 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed(
    num_events: int = 5,
    run_status: str = "success",
    terminal_last: bool = True,
):
    """Seed user + run + events. Idempotent (cleans previous data first)."""
    db = TestingSession()
    try:
        if not db.query(UserModel).filter(UserModel.id == USER_ID).first():
            db.add(
                UserModel(
                    id=USER_ID,
                    username="ssetest",
                    email="ssetest@zahara.test",
                    hashed_password="fakehash",
                    is_active=True,
                )
            )
            db.flush()

        db.query(RunEventModel).filter(RunEventModel.run_id == RUN_ID).delete()
        db.query(RunModel).filter(RunModel.id == RUN_ID).delete()
        db.flush()

        db.add(
            RunModel(
                id=RUN_ID,
                user_id=USER_ID,
                status=run_status,
                request_id="req_ssetest",
                source="test",
            )
        )
        db.flush()

        for i in range(1, num_events + 1):
            is_last = i == num_events
            ev_type = "done" if (is_last and terminal_last) else "token"
            db.add(
                RunEventModel(
                    run_id=RUN_ID,
                    seq=i,
                    type=ev_type,
                    payload={"message": f"event_{i}", "index": i},
                )
            )

        db.commit()
    finally:
        db.close()


def _parse_sse(raw: str) -> Tuple[List[Dict], List[str]]:
    """Parse raw SSE text into (data_frames, heartbeat_comments)."""
    frames: List[Dict] = []
    heartbeats: List[str] = []

    for block in raw.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        if block.startswith(": heartbeat"):
            heartbeats.append(block)
            continue

        sse_id = None
        data_str = None
        for line in block.split("\n"):
            if line.startswith("id: "):
                sse_id = int(line[4:])
            elif line.startswith("data: "):
                data_str = line[6:]

        if data_str:
            payload = json.loads(data_str)
            frames.append(
                {
                    "seq": payload.get("seq"),
                    "type": payload.get("type"),
                    "sse_id": sse_id,
                    "payload": payload.get("payload", {}),
                }
            )

    return frames, heartbeats


def _get(client: TestClient, path: str, **kwargs):
    """GET with SessionLocal patched to use the test engine."""
    with patch("app.routers.run.SessionLocal", TestingSession):
        return client.get(path, **kwargs)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ===========================================================================
# 1. MONOTONIC SEQ
# ===========================================================================


class TestSeqMonotonic:
    """Every event carries a monotonic, 1-based seq per run."""

    def test_seq_strictly_increasing(self, client):
        _seed(num_events=5)
        resp = _get(client, f"/runs/{RUN_ID}/events")
        assert resp.status_code == 200

        frames, _ = _parse_sse(resp.text)
        seqs = [f["seq"] for f in frames]
        assert seqs == [1, 2, 3, 4, 5]
        for i in range(1, len(seqs)):
            assert seqs[i] > seqs[i - 1]

    def test_sse_id_equals_seq(self, client):
        """SSE id: field must match seq so Last-Event-ID reconnect works."""
        _seed(num_events=3)
        resp = _get(client, f"/runs/{RUN_ID}/events")
        frames, _ = _parse_sse(resp.text)
        for f in frames:
            assert f["sse_id"] == f["seq"]


# ===========================================================================
# 2. CURSOR-BASED RECONNECT
# ===========================================================================


class TestCursorReconnect:
    """?cursor= replays only events with seq > cursor."""

    def test_cursor_skips_seen(self, client):
        _seed(num_events=5)
        resp = _get(client, f"/runs/{RUN_ID}/events?cursor=3")
        assert resp.status_code == 200
        frames, _ = _parse_sse(resp.text)
        assert [f["seq"] for f in frames] == [4, 5]

    def test_cursor_zero_returns_all(self, client):
        _seed(num_events=5)
        resp = _get(client, f"/runs/{RUN_ID}/events?cursor=0")
        frames, _ = _parse_sse(resp.text)
        assert len(frames) == 5


# ===========================================================================
# 3. LAST-EVENT-ID RECONNECT
# ===========================================================================


class TestLastEventIdReconnect:
    """Last-Event-ID header replays missed events."""

    def test_header_resumes(self, client):
        _seed(num_events=5)
        resp = _get(
            client,
            f"/runs/{RUN_ID}/events",
            headers={"Last-Event-ID": "3"},
        )
        assert resp.status_code == 200
        frames, _ = _parse_sse(resp.text)
        assert [f["seq"] for f in frames] == [4, 5]


# ===========================================================================
# 4. DISCONNECT / RECONNECT SIMULATION
# ===========================================================================


class TestDisconnectReconnect:
    """Simulate disconnect/reconnect and verify seq continuity + replay."""

    def test_full_then_partial_no_gaps(self, client):
        _seed(num_events=10)

        # Full stream
        resp_all = _get(client, f"/runs/{RUN_ID}/events")
        all_frames, _ = _parse_sse(resp_all.text)
        all_seqs = [f["seq"] for f in all_frames]
        assert all_seqs == list(range(1, 11))

        # Simulate disconnect at seq 6, reconnect
        resp_resume = _get(
            client,
            f"/runs/{RUN_ID}/events",
            headers={"Last-Event-ID": "6"},
        )
        resume_frames, _ = _parse_sse(resp_resume.text)
        resume_seqs = [f["seq"] for f in resume_frames]
        assert resume_seqs == list(range(7, 11))

        # Combined coverage is complete with no gaps
        combined = all_seqs[:6] + resume_seqs
        assert combined == list(range(1, 11))

    def test_reconnect_at_last_seq_yields_nothing(self, client):
        """Reconnecting at the last seq returns zero duplicate events."""
        _seed(num_events=5)
        resp = _get(client, f"/runs/{RUN_ID}/events?cursor=5")
        frames, _ = _parse_sse(resp.text)
        assert frames == []


# ===========================================================================
# 5. HEARTBEAT
# ===========================================================================


class TestHeartbeat:
    """Heartbeat is an SSE comment, not a data event."""

    def test_heartbeat_emitted(self, client):
        # terminal_last=False: no 'done' event, but run status is 'success'.
        # Generator emits 3 token events, then polls, finds no new events,
        # detects terminal run status, and returns.
        # With interval=0 the heartbeat fires between first and second poll.
        _seed(num_events=3, terminal_last=False)
        with patch("app.routers.run.HEARTBEAT_INTERVAL_SECONDS", 0):
            resp = _get(client, f"/runs/{RUN_ID}/events")

        assert resp.status_code == 200
        _, heartbeats = _parse_sse(resp.text)
        assert len(heartbeats) >= 1
        assert heartbeats[0].startswith(": heartbeat")

    def test_heartbeat_does_not_consume_seq(self, client):
        _seed(num_events=3, terminal_last=False)
        with patch("app.routers.run.HEARTBEAT_INTERVAL_SECONDS", 0):
            resp = _get(client, f"/runs/{RUN_ID}/events")

        frames, _ = _parse_sse(resp.text)
        assert [f["seq"] for f in frames] == [1, 2, 3]

    def test_interval_within_spec(self):
        from app.routers.run import HEARTBEAT_INTERVAL_SECONDS

        assert 15 <= HEARTBEAT_INTERVAL_SECONDS <= 30


# ===========================================================================
# 6. /stream ALIAS
# ===========================================================================


class TestStreamAlias:
    """/runs/{id}/stream mirrors /runs/{id}/events."""

    def test_stream_returns_same_seqs(self, client):
        _seed(num_events=5)
        resp_events = _get(client, f"/runs/{RUN_ID}/events")
        resp_stream = _get(client, f"/runs/{RUN_ID}/stream")

        ev_frames, _ = _parse_sse(resp_events.text)
        st_frames, _ = _parse_sse(resp_stream.text)
        assert [f["seq"] for f in ev_frames] == [f["seq"] for f in st_frames]


# ===========================================================================
# 7. RESPONSE HEADERS
# ===========================================================================


class TestResponseHeaders:
    """SSE response includes proxy-safe headers."""

    def test_headers(self, client):
        _seed(num_events=1)
        resp = _get(client, f"/runs/{RUN_ID}/events")
        assert resp.headers.get("cache-control") == "no-cache"
        assert resp.headers.get("x-accel-buffering") == "no"
        assert "text/event-stream" in resp.headers.get("content-type", "")
