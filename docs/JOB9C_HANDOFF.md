# Job 9C -- Accounts + Control Plane Reliability

## Status

Complete. 8-day sprint delivering per-user accounts, SSE streaming, guardrails,
and deny-by-default tool governance for the Zahara backend API.

---

## Architecture

### Stack

| Service     | Image / Version   | Port  | Purpose             |
|-------------|-------------------|-------|---------------------|
| API         | FastAPI 0.104+    | 8000  | Backend service      |
| PostgreSQL  | 16                | 5432  | Primary data store   |
| Redis       | 7-alpine          | 6379  | Rate limiting, cache |
| Qdrant      | latest            | 6333  | Vector storage       |
| Router      | LiteLLM proxy     | 7001  | LLM routing          |

Orchestrated via Docker Compose (see `infra/docker-compose.yml`).

### Data Model

**Agents** -- includes guardrail fields added in Day 6 migration (007):

```
id                          UUID PK
user_id                     FK -> users (scoping)
name, slug, description     identity
status                      active / paused / retired
budget_daily_usd            Numeric, nullable  -- daily spend cap
tool_allowlist              JSON array, nullable -- deny-by-default tools
max_steps_per_run           Integer, nullable -- runaway: step limit
max_duration_seconds_per_run Integer, nullable -- runaway: duration limit
created_at, updated_at      timestamps
```

**Runs**:

```
id                  run_id (external)
agent_id            FK -> agents
user_id             FK -> users (scoping)
status              created / queued / running / done / error / cancelled / killed
idempotent_key      deduplication
input, output       request/response payloads
model, provider     LLM metadata
tokens_in/out/total, cost_estimate_usd    usage tracking
latency_ms          performance
```

**RunEvents** -- append-only with monotonic seq per run:

```
id          Integer PK
run_id      FK -> runs
seq         Integer NOT NULL -- monotonic per run, used for SSE reconnect
type        token / tool_call / tool_result / system / error / done / cancelled
payload     JSON
timestamp
```

**AuditLog**:

```
id, user_id, event_type, entity_type, entity_id, payload (JSONB)
```

---

## Feature Breakdown

### A. Authentication and User Scoping (Day 1)

- `POST /auth/signup` -- register with username, email, password
- `POST /auth/login` -- returns JWT (`access_token`, `token_type: bearer`)
- `GET /auth/me` -- returns current user profile (requires Bearer token)
- All protected endpoints require `Authorization: Bearer <token>`
- JWT: HS256, 7-day expiry, claims: `sub`, `uid`, `iat`, `exp`
- Passwords: bcrypt hashed with 72-byte limit enforcement
- Every DB query filters by `user_id == current_user.id`
- Usernames are lowercased on storage (`MyName` becomes `myname`)
- Signup returns `{"ok": true, "access_token": "...", "user": {...}}`

### B. Data Isolation (Days 1-3)

- Agents, runs, events, and audit rows are all owned by `user_id`
- Accessing another user's resources returns 404 (no existence leaking)
- Tested: user A cannot see, update, cancel, or kill user B resources

### C. Agent CRUD and Run Creation (Day 2)

- `POST /agents` -- create with optional guardrails fields
- `GET /agents` -- list (scoped), filterable by name (`q` param)
- `GET /agents/{id}` -- get agent + latest spec
- `PATCH /agents/{id}` -- update fields including guardrails
- `POST /agents/{id}/run` -- create run, supports `Idempotency-Key` header
- Idempotency: same key returns same run (24h window, configurable)
- Run state machine: `created -> queued -> running -> done | error | cancelled | killed`

### D. Run Events (Day 3)

- Append-only event storage with monotonic `seq` per run
- `GET /runs/{run_id}/events` -- returns all events sorted by seq (limit 5000)
- Event types: `token`, `tool_call`, `tool_result`, `system`, `error`, `done`, `cancelled`
- `seq` column enforced NOT NULL with `(run_id, seq)` unique constraint
- Atomic seq assignment via `MAX(seq)+1` with `FOR UPDATE` (PostgreSQL)

### E. SSE Streaming (Day 4)

- `GET /runs/{run_id}/stream` -- Server-Sent Events endpoint
- Heartbeat every 20 seconds (SSE comment, does not consume seq)
- Reconnect via `Last-Event-ID` header or `?cursor=seq` param (takes max of both)
- Polls DB every 0.5s; terminates when run reaches terminal state
- Response headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no`
- Each event emits `id:` field matching `seq` for browser auto-reconnect

### F. Cancel/Kill Operations (Day 5)

- `POST /runs/{run_id}/cancel` -- marks run as `cancelled`, emits event, writes audit
- Cancel is idempotent: second call on already-cancelled run returns success
- `PATCH /agents/{id}/kill` -- pauses agent, cancels all pending/running runs
- Kill creates cancellation events for each affected run and writes audit logs

### G. Guardrails (Day 6)

**Budget enforcement:**
- `budget_daily_usd` on agent model
- Checked at run creation time via `evaluate_agent_budget()`
- Blocks new runs when daily spend exceeds cap

**Tool governance (deny-by-default):**
- `tool_allowlist` on agent model (JSON array)
- `null` = **deny all tools** (deny-by-default, the default behavior)
- `null` with `TOOL_GOVERNANCE_LEGACY_OPEN=true` = allow all tools (legacy backward compat)
- `[]` (empty array) = deny all tools
- `["search", "calculator"]` = allow only named tools (case-sensitive)
- Enforcement: `_extract_tool_names()` parses OpenAI-format tool calls during streaming,
  `_check_tool_allowlist()` validates each tool, disallowed tool -> run set to `error`
- **Audit:** `tool.blocked` event written with `blocked_tools` and `reason` in payload
- **PATCH to clear:** Send `{"tool_allowlist": null}` to reset agent to deny-by-default;
  uses `_UNSET` sentinel so omitting the field != setting it to null

**Runaway protection:**
- `max_steps_per_run` and `max_duration_seconds_per_run` on agent model
- `step_count` incremented on each `tool_call`/`function_call` delta
- Duration compared against elapsed time since `run.created_at`
- Both checked every 20 chunks during streaming
- Violation -> run set to `cancelled` (not error), `runaway.stopped` audit event written

**Cancellation check during execution:**
- `run.status` re-read from DB every 20 chunks
- If status changed to `cancelled` externally, executor stops immediately

### H. Audit Trail (Days 5-6)

- Audit events written for: login, agent.created/updated, run lifecycle,
  budget.blocked, tool.blocked, runaway.stopped, cancel, kill
- `GET /audit` endpoint with filters (type, entity, id, window)

### I. Load Testing (Day 8)

- Concurrent user creation, agent creation, run creation
- Full control plane soak test (auth -> agent -> run -> events)
- Sustained load with performance degradation monitoring
- Rate limiting validated (429 responses under load)

---

## API Endpoints

### Authentication

| Method | Path           | Purpose           |
|--------|----------------|-------------------|
| POST   | /auth/signup   | Create account    |
| POST   | /auth/login    | Get JWT token     |
| GET    | /auth/me       | Current user profile |

### Agents

| Method | Path                    | Purpose                        |
|--------|-------------------------|--------------------------------|
| POST   | /agents                 | Create agent (with guardrails) |
| GET    | /agents                 | List agents (scoped)           |
| GET    | /agents/{id}            | Get agent detail               |
| PATCH  | /agents/{id}            | Update agent                   |
| DELETE | /agents/{id}            | Delete agent                   |
| PATCH  | /agents/{id}/kill       | Kill agent + cancel all runs   |

### Runs

| Method | Path                             | Purpose                  |
|--------|----------------------------------|--------------------------|
| POST   | /agents/{id}/run                 | Create run               |
| GET    | /runs                            | List runs (scoped)       |
| GET    | /runs/{id}                       | Get run detail           |
| POST   | /runs/{id}/cancel                | Cancel run (idempotent)  |
| POST   | /runs/{id}/retry                 | Retry a failed run       |

### Events and Streaming

| Method | Path                    | Purpose                        |
|--------|-------------------------|--------------------------------|
| GET    | /runs/{id}/events       | Get events (JSON)              |
| GET    | /runs/{id}/stream       | Stream events (SSE)            |
| GET    | /runs/{id}/export       | Full run export                |

### System

| Method | Path      | Purpose       |
|--------|-----------|---------------|
| GET    | /health   | Health check (`{"status":"healthy"}`) |
| GET    | /version  | API version   |

---

## Test Inventory

### Test Files

| File | Tests | Scope | Approach |
|------|-------|-------|----------|
| test_job9c_auth_and_events.py | 24 | Auth enforcement, user isolation, idempotency, event ordering | In-process TestClient + SQLite |
| test_job9c_cancel_kill.py | 13 | Cancel idempotency, kill agent, cross-user protection | HTTP integration |
| test_job9c_day6_comprehensive.py | 16 | Budget persistence, allowlist CRUD, runaway limits, combined guardrails | HTTP integration |
| test_job9c_enforcement.py | 33 | Tool name extraction, allowlist validation, runaway detection, audit event contracts, sentinel PATCH semantics | Unit tests with mocks |
| test_job9c_integration.py | 14 | Full control plane flow, user isolation, error handling | HTTP integration |
| test_job9c_soak.py | 5 | Concurrent load, sustained performance, rate limiting | HTTP load test |
| test_sse_microtest.py | 12 | Seq monotonicity, cursor reconnect, Last-Event-ID, heartbeat | In-process TestClient + SQLite |
| job9c_smoke_test.sh | 12 | End-to-end curl: signup -> login -> CRUD -> run -> events -> cancel | Shell script (curl) |

**Total: 117 tests + 12 curl scenarios = 129 test items**

### Running Tests

```bash
# All Job 9C tests
python -m pytest tests/test_job9c_*.py tests/test_sse_microtest.py -v

# Individual suites
python -m pytest tests/test_job9c_auth_and_events.py -v     # Auth + isolation
python -m pytest tests/test_job9c_cancel_kill.py -v          # Cancel/kill
python -m pytest tests/test_job9c_day6_comprehensive.py -v   # Guardrails CRUD
python -m pytest tests/test_job9c_enforcement.py -v          # Enforcement logic
python -m pytest tests/test_job9c_integration.py -v          # Integration flows
python -m pytest tests/test_job9c_soak.py -v                 # Load testing
python -m pytest tests/test_sse_microtest.py -v              # SSE streaming

# Curl smoke test (requires running Docker stack)
./job9c_smoke_test.sh
```

### Requirements Coverage Matrix

| Requirement | Test Files |
|-------------|-----------|
| A. Auth/login + token | auth_and_events, integration, smoke |
| B. Data isolation | auth_and_events, integration |
| C. Agent CRUD + idempotency | auth_and_events, integration, day6_comprehensive, smoke |
| D. Run events (append-only, seq) | auth_and_events, sse_microtest |
| E. SSE streaming + heartbeat + reconnect | sse_microtest |
| F. Budget enforcement | day6_comprehensive, enforcement |
| F. Cancel/kill idempotency | cancel_kill |
| F. Runaway protection | day6_comprehensive, enforcement |
| G. Tool governance (deny-by-default) | day6_comprehensive, enforcement |
| H. Audit trail | cancel_kill, integration |
| I. Load/soak testing | soak |

---

## Deployment

### Start Services

```bash
cd infra/
make up        # Start all 5 services
make ps        # Check status
make test      # Health check
make down      # Stop all services
```

### Database Migrations

```bash
cd services/api/
alembic upgrade head       # Apply all migrations
alembic downgrade -1       # Roll back one migration
```

### Environment Variables

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/zahara_api
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
JWT_SECRET_KEY=<32+ char random string>
JWT_ALGORITHM=HS256
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_PERIOD_SECONDS=60
TOOL_GOVERNANCE_LEGACY_OPEN=false  # true to allow all tools when allowlist is null (legacy)
```

### Rate Limiting

Default: 60 requests per 60 seconds per IP. Returns HTTP 429 when exceeded.

---

## Known Limitations

1. Rate limiting is IP-based (not per-user token)
2. Idempotency key expiration is hardcoded at 24 hours
3. Tool allowlist uses exact string matching (case-sensitive, no glob/regex)
4. Budget tracking resets daily (no sub-day granularity)
5. Enforcement violations are audit-logged internally but not sent to external systems
6. `TOOL_GOVERNANCE_LEGACY_OPEN=true` re-enables pre-Job-9C behavior (`null` = allow all)
7. Usernames are lowercased on storage (case-insensitive uniqueness)
7. SSE endpoint only accepts GET; HEAD requests return HTTP 405
8. Health endpoint returns `{"status":"healthy"}`, not `{"status":"ok"}`

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Token has expired" | JWT expired (7 day default) | Call `POST /auth/login` for new token |
| 404 on agent/run access | Resource belongs to different user | Check `Authorization` header matches resource owner |
| 429 Too Many Requests | Rate limit exceeded | Wait 60s, implement backoff |
| Events not appearing | Async event creation | Retry after 1-2 seconds |
| Budget validation error | Negative budget value | Set `budget_daily_usd >= 0` or `null` |
| Port 7000 conflict (macOS) | AirPlay Receiver | Router mapped to 7001:7000 in compose |
| Docker image stale / missing features | Code changes not in container | Rebuild with `make -C infra build` then `make -C infra up` |
| `/me` returns 404 | Auth router prefix is `/auth` | Use `/auth/me` not `/me` |
| Username case mismatch | API lowercases on storage | Compare case-insensitively or use lowercase values |

---

## Verification Record

Full spec verification performed on 16 Mar 2026.

| Layer | Result |
|-------|--------|
| Codebase audit (endpoints + features) | 26/26 present |
| Live Docker curl (40-check script) | 40/40 PASS |
| Curl smoke script (`job9c_smoke_test.sh`) | 12/12 PASS |
| Pytest (`test_job9c_*.py` + `test_sse_microtest.py`) | 116 passed, 1 skipped |

All 9 workstreams (A through I) verified against the running Docker stack.
Every acceptance gate in the original sprint spec passed.
