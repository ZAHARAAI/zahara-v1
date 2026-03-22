# Zahara Testing Handoff -- Live Docker + Pytest Guide

This document captures every pattern, gotcha and procedure required to
run the Job 9C test suite. Read it end-to-end before modifying any
test file.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Docker Stack](#2-docker-stack)
3. [Live Docker Verification (curl)](#3-live-docker-verification-curl)
4. [Curl Smoke Test Script](#4-curl-smoke-test-script)
5. [Test Categories](#5-test-categories)
6. [SQLite Bootstrap Recipe (TestClient Tests)](#6-sqlite-bootstrap-recipe-testclient-tests)
7. [HTTP Integration Tests (Live Docker API)](#7-http-integration-tests-live-docker-api)
8. [Rate-Limit Retry Helper](#8-rate-limit-retry-helper)
9. [Cross-File Isolation: Module-Scoped DB Overrides](#9-cross-file-isolation-module-scoped-db-overrides)
10. [SessionLocal Direct Usage Pitfall](#10-sessionlocal-direct-usage-pitfall)
11. [UUID-Based Uniqueness for Signup/Login Pairs](#11-uuid-based-uniqueness-for-signuplogin-pairs)
12. [Agent Slug Deduplication](#12-agent-slug-deduplication)
13. [SSE Stream Test Pattern](#13-sse-stream-test-pattern)
14. [Running the Full Suite](#14-running-the-full-suite)
15. [Debugging Checklist](#15-debugging-checklist)
16. [File Inventory](#16-file-inventory)
17. [Expected Results](#17-expected-results)
18. [Verification Record](#18-verification-record)

---

## 1. Prerequisites

| Tool             | Minimum version |
|------------------|-----------------|
| Docker + Compose | v2+             |
| Python           | 3.11            |
| pip packages     | see `services/api/requirements.txt` + `pytest`, `requests` |

Create and activate a virtualenv at repo root:

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r services/api/requirements.txt
pip install pytest requests httpx
```

---

## 2. Docker Stack

### Starting the stack

```bash
make -C infra up        # pulls/builds + starts 5 services
make -C infra test      # polls GET /health up to 30 attempts
```

### Services

| Service    | Container          | Host Port | Internal Port |
|------------|--------------------|-----------|---------------|
| API        | zahara-api         | 8000      | 8000          |
| Router     | zahara-router      | 7001      | 7000          |
| PostgreSQL | zahara-postgres    | 5432      | 5432          |
| Redis      | zahara-redis       | 6379      | 6379          |
| Qdrant     | zahara-qdrant      | 6333      | 6333          |

The API container runs Alembic migrations on startup. PostgreSQL has a
health check (20 retries) -- the API waits for `service_healthy` before
starting.

### Tearing down

```bash
make -C infra down       # stop containers, keep data volumes
make -C infra clean      # stop + remove volumes (full reset)
```

### Database migrations

The API Dockerfile entrypoint runs:

```
alembic upgrade head
```

Tables are auto-created in PostgreSQL. No manual migration step is needed
for Docker tests. For TestClient tests using SQLite, tables are created
in-process (see Section 4).

---

## 3. Live Docker Verification (curl)

Before running pytest, verify the Docker stack is healthy by walking
through the full API surface with curl. Each command below was validated
against the running stack and must return the expected status codes.

### 3.1 Health and version

```bash
curl -s http://localhost:8000/health
# {"status":"healthy", ...}

curl -s http://localhost:8000/version
# {"version":"..."}
```

**Note:** The health endpoint returns `"status":"healthy"`, not `"ok"`.

### 3.2 Signup and login

```bash
TS=$(date +%s)

# Signup
curl -s -X POST http://localhost:8000/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"smoketest$TS\",\"email\":\"smoketest$TS@test.zahara.ai\",\"password\":\"password123!\"}"
# {"ok":true, "access_token":"eyJ...", "user":{...}}

# Login
curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"smoketest$TS@test.zahara.ai\",\"password\":\"password123!\"}"
# {"access_token":"eyJ...","token_type":"bearer"}
```

**Gotcha:** The API lowercases usernames on storage (`SmokeTest` becomes
`smoketest`). Use lowercase in assertions.

### 3.2a Current user profile

```bash
curl -s http://localhost:8000/auth/me \
  -H "Authorization: Bearer $TOKEN"
# {"id":"...", "username":"smoketest...", "email":"..."}
```

The `/me` endpoint lives under the `/auth` router prefix. Calling
`/me` directly returns 404.

### 3.2b Auth enforcement

```bash
# No token -- must return 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/agents
# 401

# Bad token -- must return 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/agents \
  -H "Authorization: Bearer bad-token"
# 401
```

Capture the token for subsequent calls:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"smoketest$TS@test.zahara.ai\",\"password\":\"password123!\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

### 3.3 Agent CRUD

```bash
# Create agent
curl -s -X POST http://localhost:8000/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"TestAgent$TS\",\"spec\":{}}"
# {"agent":{"id":"ag_...", ...}}

# Save agent ID
AGENT_ID=$(curl -s -X POST http://localhost:8000/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"TestAgent2$TS\",\"spec\":{}}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['id'])")

# List agents
curl -s http://localhost:8000/agents \
  -H "Authorization: Bearer $TOKEN"
# {"items":[...], ...}

# Get single agent
curl -s http://localhost:8000/agents/$AGENT_ID \
  -H "Authorization: Bearer $TOKEN"

# Update agent (add guardrails)
curl -s -X PATCH http://localhost:8000/agents/$AGENT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"budget_daily_usd":5.00,"tool_allowlist":["web_search"],"max_steps_per_run":50}'
```

### 3.4 Create agent with guardrails

```bash
curl -s -X POST http://localhost:8000/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"GuardedAgent$TS\",\"spec\":{},\"budget_daily_usd\":5.00,\"tool_allowlist\":[\"web_search\",\"calculator\"],\"max_steps_per_run\":50,\"max_duration_seconds_per_run\":300}"
# Verify response contains budget_daily_usd, tool_allowlist, max_steps_per_run
```

### 3.5 Run creation and events

```bash
# Create a run
RUN_RESPONSE=$(curl -s -X POST http://localhost:8000/agents/$AGENT_ID/run \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"input":"Hello world","source":"smoke_test"}')
echo $RUN_RESPONSE
# {"run_id":"run_...", ...}

RUN_ID=$(echo $RUN_RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['run_id'])")

# Get run events
curl -s http://localhost:8000/runs/$RUN_ID/events \
  -H "Authorization: Bearer $TOKEN"
```

### 3.6 Idempotency key

```bash
IDEM_KEY="smoke-$TS"

# First call
curl -s -X POST http://localhost:8000/agents/$AGENT_ID/run \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d '{"input":"idempotent test"}'

# Second call with same key -- must return same run_id
curl -s -X POST http://localhost:8000/agents/$AGENT_ID/run \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d '{"input":"idempotent test"}'
```

### 3.7 Cancel a run

```bash
curl -s -X POST http://localhost:8000/runs/$RUN_ID/cancel \
  -H "Authorization: Bearer $TOKEN"
# {"status":"cancelled"} or similar
```

### 3.8 Kill an agent (pauses + cancels all pending runs)

```bash
curl -s -X PATCH http://localhost:8000/agents/$AGENT_ID/kill \
  -H "Authorization: Bearer $TOKEN"
```

### 3.9 SSE stream (manual quick check)

**Note:** The SSE endpoint only accepts `GET` requests. Using `curl -sI`
(HEAD) returns HTTP 405. Use `curl -s -D- -o /dev/null --max-time 3` to
inspect response headers without a HEAD request.

```bash
# Check SSE response headers
curl -s -D- -o /dev/null --max-time 3 \
  http://localhost:8000/runs/$RUN_ID/stream \
  -H "Authorization: Bearer $TOKEN"
# Look for: content-type: text/event-stream
#           cache-control: no-cache
#           x-accel-buffering: no

# Create a fresh run for streaming
STREAM_RUN=$(curl -s -X POST http://localhost:8000/agents/$AGENT_ID/run \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"input":"stream test"}')
STREAM_RUN_ID=$(echo $STREAM_RUN | python3 -c "import sys,json; print(json.load(sys.stdin)['run_id'])")

# Open stream (Ctrl-C to stop; look for heartbeat comments and data frames)
curl -N http://localhost:8000/runs/$STREAM_RUN_ID/stream \
  -H "Authorization: Bearer $TOKEN"
```

Expected output shape:

```
: heartbeat

id: 1
data: {"type":"token","seq":1,"payload":{...}}

: heartbeat
```

### 3.10 Cross-user isolation check

```bash
# Signup a second user
curl -s -X POST http://localhost:8000/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"other$TS\",\"email\":\"other$TS@test.zahara.ai\",\"password\":\"password123!\"}"

TOKEN_B=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"other$TS@test.zahara.ai\",\"password\":\"password123!\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# User B tries to access User A's agent -- must return 404
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8000/agents/$AGENT_ID \
  -H "Authorization: Bearer $TOKEN_B"
# Expected: 404
```

---

## 4. Curl Smoke Test Script

A self-contained script at `job9c_smoke_test.sh` (repo root) automates
all curl verifications in Section 3. It runs 12 sequential tests and
exits non-zero on first failure.

### Running it

```bash
make -C infra up && make -C infra test   # ensure stack is healthy
chmod +x job9c_smoke_test.sh
./job9c_smoke_test.sh
```

Optionally override the API base URL:

```bash
API_BASE=http://staging.example.com:8000 ./job9c_smoke_test.sh
```

### What it covers

| # | Test | Assertion |
|---|------|-----------|
| 1 | User signup | Response contains `"ok"` |
| 2 | User login | Response contains `"access_token"` |
| 3 | Create basic agent | Response contains `"ag_"` prefix |
| 4 | Create guarded agent | Response contains `budget_daily_usd` |
| 5 | Get agent | Response contains agent ID |
| 6 | List agents | Response contains `"items"` |
| 7 | Update agent | Response contains updated description |
| 8 | Create run | Response contains `"run_id"` |
| 9 | Get run events | HTTP 200 |
| 10 | Idempotency key | Same `run_id` returned twice |
| 11 | Health check | Response contains `"healthy"` |
| 12 | Version endpoint | Response contains `"version"` |

All 12 tests must print `PASS`. Any failure prints `FAIL` and the
script exits immediately (`set -e`).

### Uniqueness

The script uses `$(date +%s)` for unique usernames/emails. Because
signup and login happen in the same shell variable scope (`$TIMESTAMP`
assigned once at the top), the timestamp-reuse problem described in
Section 11 does not apply here.

---

## 5. Test Categories

The suite has two fundamentally different test categories. Mixing their
patterns causes failures.

### A. TestClient Tests (In-Process, SQLite)

Use `fastapi.testclient.TestClient` with an **in-memory SQLite** database.
No Docker stack required.

| File                              | Tests | Category |
|-----------------------------------|-------|----------|
| `test_sse_microtest.py`           | 12    | TestClient |
| `test_job9c_auth_and_events.py`   | 24    | TestClient |
| `test_job9c_enforcement.py`       | 19    | Unit (no DB) |

### B. HTTP Integration Tests (Live Docker API)

Use `requests` against `http://localhost:8000`. Docker stack must be
running.

| File                              | Tests | Category |
|-----------------------------------|-------|----------|
| `test_job9c_cancel_kill.py`       | 13    | HTTP integration |
| `test_job9c_day6_comprehensive.py`| 16    | HTTP integration |
| `test_job9c_integration.py`       | 14    | HTTP integration |
| `test_job9c_soak.py`             | 4+1skip | HTTP integration |

---

## 6. SQLite Bootstrap Recipe (TestClient Tests)

Every TestClient file that touches the database must perform an **8-step
bootstrap** at module level.  Skipping any step causes subtle failures.

### Step 1 -- Set environment variables (before any app import)

```python
import os, sys
from pathlib import Path

api_path = Path(__file__).parent.parent / "services" / "api"
sys.path.insert(0, str(api_path))

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REDIS_URL",    "redis://localhost:6379")
os.environ.setdefault("SECRET_KEY",   "test_secret_key")
os.environ.setdefault("QDRANT_URL",   "http://localhost:6333")
```

`DATABASE_URL` must be set **before** importing `app.main`, because
`conftest.py` (which pytest loads first) does:

```python
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
from app.main import app          # triggers database.py engine creation
```

If conftest.py has already run, `setdefault` is a no-op and the global
engine points at a file-based SQLite DB. Each test file creates its own
in-memory engine to override it (see Step 4).

### Step 2 -- Mock Redis and Qdrant

```python
from unittest.mock import MagicMock, patch

_mock_redis = MagicMock()
_mock_redis.get.return_value = None
_mock_redis.set.return_value = True
_mock_redis.incr.return_value = 1
_mock_redis.expire.return_value = True
_mock_redis.pipeline.return_value = _mock_redis
_mock_redis.execute.return_value = [1, True]

_mock_qdrant = MagicMock()
```

These mocks prevent real connection attempts during `import app.main`.

### Step 3 -- Import app modules under mock context

```python
with (
    patch("redis.from_url", return_value=_mock_redis),
    patch("qdrant_client.QdrantClient", return_value=_mock_qdrant),
):
    from app.database import Base, get_db
    from app.main import app
    from app.models.run import Run as RunModel
    from app.models.run_event import RunEvent as RunEventModel
    from app.models.user import User as UserModel
    from app.security.jwt_auth import create_access_token
```

### Step 4 -- Register JSONB-to-JSON compiler shim

SQLAlchemy models use `JSONB` columns (PostgreSQL dialect). SQLite does
not understand `JSONB`. Register a compiler override:

```python
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles

@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"
```

Without this shim, `create_all()` raises
`CompileError: ... has no column type JSONB`.

### Step 5 -- Create in-memory SQLite engine with StaticPool

```python
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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
```

**`StaticPool` is mandatory.** Without it, each `SessionLocal()` call
opens a fresh in-memory database (empty tables). StaticPool ensures
every session shares one connection and therefore one database.

### Step 6 -- Strip PostgreSQL server defaults, run create_all, restore

Several columns have server defaults that are PostgreSQL-only (e.g.
`gen_random_uuid()::text`, type casts). These break SQLite DDL.
Temporarily remove them, create tables, then restore:

```python
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
```

Restoring defaults is essential so shared `Base.metadata` stays correct
for any other test module loaded in the same pytest process.

### Step 7 -- Define the get_db override

```python
def _override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()
```

### Step 8 -- Wire override via module-scoped fixture (See Section 7)

```python
@pytest.fixture(scope="module", autouse=True)
def _setup_db_override():
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
```

---

## 7. HTTP Integration Tests (Live Docker API)

These tests use plain `requests` against `http://localhost:8000`.

Key requirements:

1. **Docker stack must be running** (`make -C infra up && make -C infra test`).
2. **Use `api_post`/`api_get`/etc. from `tests/_http_helpers.py`** instead of
   raw `requests.post()`. These wrappers retry on HTTP 429 (see Section 6).
3. **Imports**: `from tests._http_helpers import api_post, api_get, api_patch, api_delete`
   (the `tests.` prefix is required because pytest runs from repo root).
4. **Use `uuid.uuid4().hex[:8]`** for email/username uniqueness (see Section 9).
5. **Use unique agent names** per fixture call (see Section 10).

### Fixture pattern (signup + login)

```python
import uuid
from tests._http_helpers import api_post

API_BASE = "http://localhost:8000"

@pytest.fixture
def auth_headers(self):
    uid = uuid.uuid4().hex[:8]
    email = f"mytest-{uid}@test.zahara.ai"
    api_post(f"{API_BASE}/auth/signup", json={
        "username": f"user{uid}",
        "email": email,
        "password": "password123!",
    })
    res = api_post(f"{API_BASE}/auth/login", json={
        "email": email,
        "password": "password123!",
    })
    return {"Authorization": f"Bearer {res.json()['access_token']}"}
```

---

## 8. Rate-Limit Retry Helper

The API enforces **60 requests per 60 seconds per IP** via Redis-backed
rate limiting. When running all HTTP integration tests together, this
limit is easily hit.

The helper at `tests/_http_helpers.py` wraps `requests.request()`:

```python
_MAX_RETRIES = 5
_RETRY_WAIT  = 5  # seconds

def api_request(method, url, **kwargs):
    kwargs.setdefault("timeout", 10)
    for attempt in range(_MAX_RETRIES + 1):
        res = requests.request(method, url, **kwargs)
        if res.status_code != 429:
            return res
        if attempt < _MAX_RETRIES:
            wait = float(res.headers.get("Retry-After", _RETRY_WAIT))
            time.sleep(wait)
    return res
```

Convenience functions: `api_post`, `api_get`, `api_patch`, `api_delete`.

**All HTTP integration tests must use these helpers** rather than raw
`requests`.

---

## 9. Cross-File Isolation: Module-Scoped DB Overrides

### The problem

When running multiple TestClient files in a single pytest invocation,
they all share one `app` object. If file A sets
`app.dependency_overrides[get_db]` at module level (not in a fixture),
that override persists when file B loads -- and file B's override
replaces file A's. The last file to import wins, causing earlier files'
TestClient instances to use the wrong database.

### The solution

Every TestClient file must use a **module-scoped autouse fixture with
teardown**:

```python
@pytest.fixture(scope="module", autouse=True)
def _setup_db_override():
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)  # cleanup after module
```

The `yield` + `pop()` ensures the override is removed when pytest
finishes the module, so the next module starts with a clean slate.

**Never** set `app.dependency_overrides` at bare module level.

---

## 10. SessionLocal Direct Usage Pitfall

### The problem

The SSE stream generator in `services/api/app/routers/run.py` (line ~670)
opens its own database session **directly**:

```python
async def event_generator():
    while True:
        with SessionLocal() as s:       # <-- bypasses Depends(get_db)
            new_events = s.query(RunEventModel)...
```

Because `SessionLocal` is imported directly from `app.database`, it is
bound to the **production engine** (PostgreSQL or conftest.py's SQLite
file). The `get_db` dependency override does not affect this call.

### The solution

Any test that exercises the SSE stream generator must **also** patch
`SessionLocal`:

```python
from unittest.mock import patch

with patch("app.routers.run.SessionLocal", TestingSession):
    res = client.get(f"/runs/{run_id}/stream", headers=auth_headers)
```

The `test_sse_microtest.py` file wraps this in a `_get()` helper that
patches `SessionLocal` on every request:

```python
def _get(client, path, **kwargs):
    headers = {**_AUTH_HEADERS, **kwargs.pop("headers", {})}
    with patch("app.routers.run.SessionLocal", TestingSession):
        return client.get(path, headers=headers, **kwargs)
```

---

## 11. UUID-Based Uniqueness for Signup/Login Pairs

### The problem

Using `int(time.time())` to generate unique emails fails when
`signup()` and `login()` are called in different seconds:

```python
# BAD -- time.time() returns different values on each call
email = f"user-{int(time.time())}@test.zahara.ai"
signup(email=email, ...)
# ... milliseconds pass ...
email = f"user-{int(time.time())}@test.zahara.ai"  # different!
login(email=email, ...)  # 401 -- user not found
```

### The solution

Generate a single UUID token and reuse it for both calls:

```python
uid = uuid.uuid4().hex[:8]
email = f"user-{uid}@test.zahara.ai"
api_post("/auth/signup", json={"email": email, ...})
api_post("/auth/login",  json={"email": email, ...})
```

This pattern is used in **every** HTTP integration test fixture.

---

## 12. Agent Slug Deduplication

The `POST /agents` endpoint returns an existing agent if the slug
(derived from the name) already exists for that user. This means two
tests using the same agent name silently share one agent, causing
unexpected state leaks (e.g. one test kills the agent, the next test
finds it already dead).

Fix: include a UUID in agent names:

```python
agent_name = f"test-agent-{uuid.uuid4().hex[:8]}"
```

---

## 13. SSE Stream Test Pattern

Testing the `GET /runs/{id}/stream` endpoint with `TestClient` requires
special handling because the SSE generator runs an infinite loop until
the run reaches a terminal status.

### Pattern

1. Create a run (status defaults to `"pending"`).
2. **Before requesting the stream**, update the run to a terminal status
   (`"success"` or `"error"`) directly via `TestingSession`:
   ```python
   db = TestingSession()
   db.query(RunModel).filter(RunModel.id == run_id).update({"status": "success"})
   db.commit()
   db.close()
   ```
3. Patch `SessionLocal` and make the request:
   ```python
   with patch("app.routers.run.SessionLocal", TestingSession):
       res = client.get(f"/runs/{run_id}/stream", headers=auth_headers)
   ```
4. Assert `content-type` is `text/event-stream`.

If you skip step 2, `client.get()` blocks indefinitely because the
generator polls forever waiting for the run to become terminal.

---

## 14. Running the Full Suite

### TestClient tests only (no Docker needed)

```bash
python -m pytest tests/test_sse_microtest.py tests/test_job9c_auth_and_events.py tests/test_job9c_enforcement.py -v
```

### HTTP integration tests only (Docker must be running)

```bash
make -C infra up && make -C infra test
python -m pytest tests/test_job9c_cancel_kill.py tests/test_job9c_day6_comprehensive.py tests/test_job9c_integration.py tests/test_job9c_soak.py -v
```

### All Job 9C tests together

```bash
make -C infra up && make -C infra test
python -m pytest tests/test_job9c_*.py tests/test_sse_microtest.py -v
```

### pytest configuration

From `pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
addopts = -v --disable-warnings --maxfail=1
```

Key: `asyncio_mode = auto` is required for async fixtures in conftest.py.

---

## 15. Debugging Checklist

| Symptom | Cause | Fix |
|---------|-------|-----|
| `no such table: users` | conftest.py's `import app.main` created an engine pointing at `sqlite:///./test.db` (file-based), but `create_all` ran on a different in-memory engine. | Ensure `StaticPool` is used and `get_db` is overridden via module-scoped fixture. |
| `JSONB` / `CompileError` on `create_all` | JSONB columns not compiled for SQLite. | Add the `@compiles(JSONB, "sqlite")` shim (Section 6, Step 4). |
| `gen_random_uuid()` error on `create_all` | PostgreSQL server defaults in column metadata. | Strip and restore defaults (Section 6, Step 6). |
| `client.get("/runs/.../stream")` hangs | SSE generator infinite loop, run is not terminal. | Mark run as terminal before requesting stream (Section 13). |
| SSE stream returns empty / wrong data | `SessionLocal()` inside generator uses production engine. | Patch `app.routers.run.SessionLocal` with `TestingSession` (Section 10). |
| HTTP 429 on integration tests | Rate limiter: 60 req/60s per IP. | Use `api_post` / `api_get` from `tests/_http_helpers.py` (Section 8). |
| `401` on login after signup | Email generated differently between signup and login calls. | Use single `uuid.uuid4().hex[:8]` for both (Section 11). |
| Shared agent state across tests | Agent slug deduplication returns existing agent. | Unique agent name per fixture call (Section 12). |
| Tests pass alone but fail together | `app.dependency_overrides` leaking across modules. | Module-scoped fixture with `yield` + `pop()` teardown (Section 9). |
| `ModuleNotFoundError: tests._http_helpers` | Import path wrong. | Use `from tests._http_helpers import ...` (not `from _http_helpers`). |
| `X-Accel-Buffering` header missing | Docker image is stale and doesn't have latest code. | Rebuild with `make -C infra build` then `make -C infra up`. |
| `curl -sI` on SSE returns 405 | SSE endpoint only allows GET; `-sI` sends HEAD. | Use `curl -s -D- -o /dev/null --max-time 3` instead. |
| `/me` returns 404 | Auth router prefix is `/auth`. | Use `/auth/me` not `/me`. |
| Username case mismatch in assertions | API lowercases usernames on storage. | Use case-insensitive comparison or lowercase expected values. |

---

## 16. File Inventory

### Test files

| File | Tests | Description |
|------|-------|-------------|
| `job9c_smoke_test.sh` | 12 | End-to-end curl smoke tests (auth, CRUD, idempotency, health) |
| `tests/conftest.py` | -- | Path + env setup, imports `app.main`, async fixtures |
| `tests/_http_helpers.py` | -- | Rate-limit retry wrappers for HTTP integration tests |
| `tests/test_sse_microtest.py` | 12 | SSE seq, reconnect, heartbeat, headers (TestClient) |
| `tests/test_job9c_auth_and_events.py` | 24 | JWT auth, user scoping, idempotency, events (TestClient) |
| `tests/test_job9c_enforcement.py` | 19 | Tool allowlist, runaway protection (pure unit) |
| `tests/test_job9c_cancel_kill.py` | 13 | Run cancel, agent kill, audit (HTTP integration) |
| `tests/test_job9c_day6_comprehensive.py` | 16 | Budget, validation, data persistence (HTTP integration) |
| `tests/test_job9c_integration.py` | 14 | End-to-end control plane flows (HTTP integration) |
| `tests/test_job9c_soak.py` | 4+1 | Load test with reduced concurrency (HTTP integration) |

### Key source files

| File | Relevance to tests |
|------|--------------------|
| `services/api/app/database.py` | Defines `engine`, `SessionLocal`, `Base`, `get_db` |
| `services/api/app/security/jwt_auth.py` | `create_access_token()` used to mint test JWTs |
| `services/api/app/routers/run.py` | SSE generator uses `SessionLocal()` directly (line ~670) |
| `services/api/app/models/run.py` | Run model with status, user_id, request_id |
| `services/api/app/models/run_event.py` | RunEvent with `seq`, `uuid` (has PG server_default) |
| `services/api/app/models/user.py` | User model for auth tests |
| `infra/docker-compose.yml` | 5-service stack definition |
| `infra/Makefile` | `up`, `down`, `test`, `clean` targets |

---

## 17. Expected Results

```
102 passed, 1 skipped
```

The 1 skipped test is in `test_job9c_soak.py` (a performance threshold
assertion marked with `pytest.mark.skip` for CI stability).

### Curl smoke test

```
12/12 PASS
```

### Combined total

| Layer | Count |
|-------|-------|
| pytest | 102 passed, 1 skipped |
| curl smoke | 12 passed |
| **Total** | **114 passed, 1 skipped** |

Full invocation:

```bash
# Pytest
python -m pytest tests/test_job9c_*.py tests/test_sse_microtest.py -v

# Curl smoke
./job9c_smoke_test.sh
```

If any test fails, consult the Debugging Checklist in Section 15.

---

## 18. Verification Record

Full spec verification was performed against the running Docker stack on
16 Mar 2026. Results:

| Layer | Result |
|-------|--------|
| Codebase audit (endpoints + features) | 26/26 present |
| Live Docker curl (40-check spec script) | 40/40 PASS |
| Curl smoke script (`job9c_smoke_test.sh`) | 12/12 PASS |
| Pytest (`test_job9c_*.py` + `test_sse_microtest.py`) | 102 passed, 1 skipped |

One issue found during verification: the Docker image was stale and
missing the `X-Accel-Buffering: no` header that existed in source code.
Resolved by rebuilding with `make -C infra build`.

All 9 spec workstreams (A-I) verified:

| Workstream | Checks | Status |
|------------|--------|---------|
| A. Auth (signup/login/me/401) | 6 | PASS |
| B. Data isolation (cross-user 404) | 4 | PASS |
| C. Agent CRUD + run + idempotency | 7 | PASS |
| D. Run events persistence | 2 | PASS |
| E. SSE streaming + headers | 4 | PASS |
| F. Cancel/kill + guardrails | 9 | PASS |
| G. Tool governance | 2 | PASS |
| H. Audit trail | 4 | PASS |
| I. Load/soak testing | 2 | PASS |
