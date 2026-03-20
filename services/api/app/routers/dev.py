"""
dev.py  —  Development / Demo endpoints
Only mounted when ENABLE_DEV_PAGES=1 (gated in main.py).

Endpoints
---------
GET  /dev/test          health-check stub
GET  /dev/health        extended health info
POST /dev/seed          create demo agents + seeded run history  (TASK-B1, E3)
DELETE /dev/seed        wipe demo data for the current user      (TASK-E4)
"""

from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.agent import Agent as AgentModel
from ..models.agent_spec import AgentSpec as AgentSpecModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..models.user import User
from ..security.jwt_auth import hash_password
from ..services.audit import log_audit_event

logger = logging.getLogger("zahara.api.dev")
router = APIRouter(prefix="/dev", tags=["development"])

# ── Filesystem root (same as files.py) ────────────────────────────────────────
FS_ROOT = Path(os.getenv("ZAHARA_FS_ROOT", "./data/agents")).resolve()

# ── Guest user constants ──────────────────────────────────────────────────────
GUEST_EMAIL = "guest@demo.zahara.ai"
GUEST_USERNAME = "guest"
GUEST_PASSWORD = "guest_demo_not_a_real_password"


# ── ID generators (same convention as agents.py / run.py) ─────────────────────


def _ag() -> str:
    return "ag_" + uuid4().hex[:10].upper()


def _run_id() -> str:
    return "run_" + uuid4().hex[:16]


def _spec_id() -> str:
    return "as_" + uuid4().hex[:16]


def _dt(ago: timedelta) -> datetime:
    return datetime.now(timezone.utc) - ago


# ── Demo agent definitions ────────────────────────────────────────────────────

DEMO_AGENTS = [
    {
        "slug": "demo-zahara-assistant",
        "name": "Zahara Assistant",
        "description": "A helpful general-purpose AI assistant — writing, analysis, and Q&A. (Demo)",
        "budget_daily_usd": 5.00,
        "spec": {
            "demo_mode": True,
            "system_prompt": (
                "You are Zahara, a helpful and concise AI assistant. "
                "You excel at writing, analysis, summarisation, and answering questions clearly."
            ),
            "graph": {
                "nodes": [
                    {"id": "start", "type": "start", "data": {}},
                    {
                        "id": "model-1",
                        "type": "model",
                        "data": {"provider": "openai", "model": "gpt-4o-mini"},
                    },
                    {"id": "output", "type": "output", "data": {}},
                ],
                "edges": [
                    {"source": "start", "target": "model-1"},
                    {"source": "model-1", "target": "output"},
                ],
            },
        },
    },
    {
        "slug": "demo-code-reviewer",
        "name": "Code Reviewer",
        "description": "Reviews code for bugs, performance issues, and best-practice violations. (Demo)",
        "budget_daily_usd": 10.00,
        "spec": {
            "demo_mode": True,
            "system_prompt": (
                "You are an expert code reviewer. You identify bugs, performance problems, "
                "security vulnerabilities, and style issues. You always suggest concrete fixes."
            ),
            "graph": {
                "nodes": [
                    {"id": "start", "type": "start", "data": {}},
                    {
                        "id": "model-1",
                        "type": "model",
                        "data": {"provider": "openai", "model": "gpt-4o-mini"},
                    },
                    {"id": "output", "type": "output", "data": {}},
                ],
                "edges": [
                    {"source": "start", "target": "model-1"},
                    {"source": "model-1", "target": "output"},
                ],
            },
        },
    },
]

# ── Pre-seeded run history ────────────────────────────────────────────────────

DEMO_RUNS: List[dict] = [
    # ── Zahara Assistant ─────────────────────────────────────────────────────
    {
        "agent_slug": "demo-zahara-assistant",
        "status": "success",
        "input": "Explain the concept of machine learning in simple terms",
        "ago": timedelta(hours=2),
        "latency_ms": 1840,
        "tokens_in": 42,
        "tokens_out": 287,
        "cost_usd": 0.000097,
        "tokens": [
            "Machine learning is a subset of artificial intelligence ",
            "that enables systems to learn and improve from experience ",
            "without being explicitly programmed.\n\n",
            "**Core Principle**: ML algorithms build mathematical models ",
            "from training data, allowing them to make predictions ",
            "or decisions without explicit rule-based programming.\n\n",
            "**Three Main Types**:\n\n",
            "1. **Supervised Learning** — learns from labelled data. ",
            "Examples: spam detection, image classification, price prediction.\n\n",
            "2. **Unsupervised Learning** — finds hidden patterns in unlabelled data. ",
            "Used for customer segmentation and anomaly detection.\n\n",
            "3. **Reinforcement Learning** — agent learns by interacting ",
            "with an environment, receiving rewards for correct actions.\n\n",
            "**Real-world Applications**: recommendation engines (Netflix, Spotify), ",
            "medical diagnosis, autonomous vehicles, and fraud detection.\n\n",
            "The key insight: instead of writing explicit rules, ",
            "you provide examples and let the algorithm discover the patterns itself.",
        ],
    },
    {
        "agent_slug": "demo-zahara-assistant",
        "status": "success",
        "input": "Write a short poem about the future of AI",
        "ago": timedelta(days=1, hours=3),
        "latency_ms": 1420,
        "tokens_in": 31,
        "tokens_out": 134,
        "cost_usd": 0.000051,
        "tokens": [
            "**Silicon Dreams**\n\n",
            "In circuits deep where data flows,\n",
            "A new intelligence quietly grows —\n",
            "Not born of flesh nor breathing air,\n",
            "Yet learning fast beyond compare.\n\n",
            "It reads our words, it maps our skies,\n",
            "It finds the patterns in our lives.\n",
            "Not here to take, but here to give:\n",
            "A partner built so we may live\n\n",
            "More fully, freely, without fear —\n",
            "The future, strange and bright, is here.",
        ],
    },
    {
        "agent_slug": "demo-zahara-assistant",
        "status": "error",
        "input": "Analyse the financial dataset and generate a quarterly report",
        "ago": timedelta(hours=3),
        "latency_ms": 340,
        "tokens_in": 28,
        "tokens_out": 0,
        "cost_usd": 0.0,
        "error_message": "No file attachment provided. Please upload a dataset to analyse.",
        "tokens": [],
    },
    {
        "agent_slug": "demo-zahara-assistant",
        "status": "cancelled",
        "input": "Summarise the entire history of the Roman Empire",
        "ago": timedelta(minutes=35),
        "latency_ms": 610,
        "tokens_in": 22,
        "tokens_out": 48,
        "cost_usd": 0.000018,
        "tokens": [
            "The Roman Empire, one of history's greatest civilisations, ",
            "spanned from 27 BC to 476 AD in the West ",
            "and continued as the Byzantine Empire until 1453 AD.\n\n",
            "**Origins**: Rome began as a small city-state on the Tiber River, ",
        ],
    },
    # ── Code Reviewer ─────────────────────────────────────────────────────────
    {
        "agent_slug": "demo-code-reviewer",
        "status": "success",
        "input": "Review this Python function for bugs and performance issues",
        "ago": timedelta(hours=4),
        "latency_ms": 2105,
        "tokens_in": 38,
        "tokens_out": 312,
        "cost_usd": 0.000110,
        "tokens": [
            "I've reviewed the function. Here are my findings:\n\n",
            "**\U0001f534 Critical Issues**\n\n",
            "- **Off-by-one error**: range should be `range(len(items) - 1)`, ",
            "not `range(len(items))` \u2014 causes IndexError on the last item.\n",
            "- **Missing null check**: `user_data` could be `None` if the DB query fails.\n\n",
            "**\U0001f7e1 Performance Concerns**\n\n",
            "- Nested loops create O(n\u00b2) complexity \u2014 use a dict for O(1) lookups.\n",
            "- String concat in a loop is slow; use `''.join()` instead.\n\n",
            "**\U0001f535 Style & Best Practices**\n\n",
            "- Add type hints: `def process_items(items: list[dict]) -> list[str]`\n",
            "- Split into `validate_input()` and `process_items()` \u2014 single responsibility.\n",
            "- Missing docstring.\n\n",
            "**Suggested refactor**:\n",
            "```python\n",
            "def process_items(items: list[dict]) -> list[str]:\n",
            '    """Process items, returning formatted strings."""\n',
            "    if not items:\n        return []\n",
            "    return [f\"{i['name']}: {i['value']}\" for i in items]\n",
            "```\n\n",
            "Overall: Logic is sound \u2014 fix the critical issues before merging. \u2705",
        ],
    },
    {
        "agent_slug": "demo-code-reviewer",
        "status": "success",
        "input": "Explain the time complexity of binary search and when to use it",
        "ago": timedelta(days=2),
        "latency_ms": 1670,
        "tokens_in": 33,
        "tokens_out": 201,
        "cost_usd": 0.000074,
        "tokens": [
            "**Binary Search \u2014 O(log n)**\n\n",
            "With each comparison, binary search eliminates half the remaining elements. ",
            "For 1,000,000 items it needs at most ~20 comparisons.\n\n",
            "**Space Complexity**: O(1) iterative, O(log n) recursive.\n\n",
            "**When to use**:\n",
            "\u2705 Collection is **sorted** (prerequisite \u2014 non-negotiable)\n",
            "\u2705 You need **fast lookups** (O(log n) vs O(n) linear scan)\n",
            "\u2705 Large datasets \u2014 overhead not worth it for < 20 elements\n",
            "\u2705 Random access is O(1) \u2014 works for arrays, not linked lists\n\n",
            "**When NOT to use**:\n",
            "\u274c Unsorted data (sort first \u2014 O(n log n) \u2014 or use a hash map)\n",
            "\u274c Frequent insertions/deletions (use a BST or sorted set)\n\n",
            "**Python**: `bisect.bisect_left(arr, target)` from the standard library.",
        ],
    },
    {
        "agent_slug": "demo-code-reviewer",
        "status": "error",
        "input": "Find the memory leak in this TypeScript service",
        "ago": timedelta(hours=1, minutes=10),
        "latency_ms": 280,
        "tokens_in": 24,
        "tokens_out": 0,
        "cost_usd": 0.0,
        "error_message": "Code context too large (>32k tokens). Please provide a focused snippet.",
        "tokens": [],
    },
]


# ── Pydantic schemas ──────────────────────────────────────────────────────────


def _make_event_adder(db: Session, rid: str, created_at: datetime):
    """
    Returns a stateful _evt() callable that adds RunEvent rows with
    staggered timestamps and monotonically-incrementing seq numbers,
    pinning `rid` and `created_at` to the values at the time of factory
    call (avoids late-binding closure bugs).

    seq must be unique per run_id due to the uq_run_events_run_id_seq
    constraint — we increment it on every call.
    """
    state = {"offset_ms": 0, "seq": 0}

    def _evt(type_: str, payload: dict) -> None:
        state["offset_ms"] += 80
        ts = created_at + timedelta(milliseconds=state["offset_ms"])
        db.add(
            RunEventModel(
                run_id=rid,
                type=type_,
                payload=payload,
                created_at=ts,
                seq=state["seq"],
            )
        )
        state["seq"] += 1

    return _evt


class SeedRequest(BaseModel):
    preset: Optional[str] = "full"  # "minimal" | "full" (reserved for future)
    force: bool = False


class SeedResponse(BaseModel):
    ok: bool = True
    agents_created: int
    runs_created: int
    agent_ids: List[str]
    files_written: int = 0
    guest_user_id: Optional[int] = None
    seeded_at: str
    message: str


class DeleteSeedResponse(BaseModel):
    ok: bool = True
    agents_deleted: int
    runs_deleted: int
    dirs_deleted: int = 0
    message: str


# ── Internal helpers ──────────────────────────────────────────────────────────

DEMO_SLUG_PREFIX = "demo-"

# ── Pro workspace file definitions ────────────────────────────────────────────

_WORKSPACE_FILES: dict[str, dict[str, str]] = {
    "demo-zahara-assistant": {
        "agent.yaml": """\
name: Zahara Assistant
slug: demo-zahara-assistant
description: A helpful general-purpose AI assistant.
model:
  provider: openai
  model: gpt-4o-mini
  temperature: 0.7
  max_tokens: 800
system_prompt: |
  You are Zahara, a helpful and concise AI assistant.
  You excel at writing, analysis, summarisation,
  and answering questions clearly.
""",
        "README.md": """\
# Zahara Assistant

A general-purpose AI assistant that excels at writing, analysis,
summarisation, and answering questions clearly.

Open **agent.yaml** to view or edit the agent configuration, then
click **Run** in the Pro toolbar to execute against this agent.
""",
    },
    "demo-code-reviewer": {
        "agent.yaml": """\
name: Code Reviewer
slug: demo-code-reviewer
description: Reviews code for bugs, performance issues, and best-practice violations.
model:
  provider: openai
  model: gpt-4o-mini
  temperature: 0.3
  max_tokens: 1200
system_prompt: |
  You are an expert code reviewer. Identify bugs, performance problems,
  security vulnerabilities, and style issues.
  Always suggest concrete fixes.
""",
        "README.md": """\
# Code Reviewer

An expert code reviewer that identifies bugs, performance problems,
security vulnerabilities, and style issues — with concrete fix suggestions.

Open **agent.yaml** to view or edit the configuration, then click
**Run** in the Pro toolbar to test it against sample code.
""",
    },
    "shared": {
        "example.py": """\
# Example agent spec — edit and run via Pro mode
# Click 'Run' in the toolbar to execute against the bound agent

def greet(name: str) -> str:
    \"\"\"Return a greeting message.\"\"\"
    return f"Hello, {name}! How can I help you today?"
""",
    },
}


def _seed_workspace_files(*, force: bool = False) -> int:
    """
    Write the default Pro workspace files into ZAHARA_FS_ROOT.

    Returns the number of files written.
    Skips existing files unless force=True.
    """
    written = 0
    for dirname, files in _WORKSPACE_FILES.items():
        dirpath = FS_ROOT / dirname
        dirpath.mkdir(parents=True, exist_ok=True)
        for filename, content in files.items():
            filepath = dirpath / filename
            if filepath.exists() and not force:
                continue
            filepath.write_text(content, encoding="utf-8")
            written += 1
    return written


def _delete_demo_workspace_dirs() -> int:
    """
    Delete data/agents/demo-* directories but keep shared/.

    Returns the number of directories deleted.
    """
    deleted = 0
    if not FS_ROOT.exists():
        return 0
    for child in FS_ROOT.iterdir():
        if child.is_dir() and child.name.startswith(DEMO_SLUG_PREFIX):
            shutil.rmtree(child)
            deleted += 1
    return deleted


def _ensure_guest_user(db: Session) -> User:
    """
    Return the shared guest user, creating it if it does not exist.
    """
    guest = db.query(User).filter(User.email == GUEST_EMAIL).first()
    if guest:
        return guest
    guest = User(
        username=GUEST_USERNAME,
        email=GUEST_EMAIL,
        hashed_password=hash_password(GUEST_PASSWORD),
        is_active=True,
    )
    db.add(guest)
    db.flush()
    return guest


def _get_existing_demo_agents(db: Session, user_id: int) -> List[AgentModel]:
    return (
        db.query(AgentModel)
        .filter(
            AgentModel.user_id == user_id,
            AgentModel.slug.like(f"{DEMO_SLUG_PREFIX}%"),
        )
        .all()
    )


def _purge_demo_data(db: Session, user_id: int) -> tuple[int, int]:
    """
    Hard-delete all demo agents and their cascading data.
    Returns (agents_deleted, runs_deleted).
    """
    demo_agents = _get_existing_demo_agents(db, user_id)
    if not demo_agents:
        return 0, 0

    agent_ids = [a.id for a in demo_agents]

    # Query objects (not .subquery()) are accepted directly by in_()
    run_ids_query = db.query(RunModel.id).filter(RunModel.agent_id.in_(agent_ids))
    run_count = db.query(RunModel).filter(RunModel.agent_id.in_(agent_ids)).count()

    # Delete in FK order: events → runs → specs → agents
    db.query(RunEventModel).filter(RunEventModel.run_id.in_(run_ids_query)).delete(
        synchronize_session=False
    )
    db.query(RunModel).filter(RunModel.agent_id.in_(agent_ids)).delete(
        synchronize_session=False
    )
    db.query(AgentSpecModel).filter(AgentSpecModel.agent_id.in_(agent_ids)).delete(
        synchronize_session=False
    )
    for a in demo_agents:
        db.delete(a)

    db.commit()
    return len(demo_agents), run_count


def _build_demo_data(db: Session, user_id: int) -> SeedResponse:
    """
    Insert demo agents, their specs, and pre-seeded run history rows.
    All timestamps are set to realistic past times so the Clinic timeline
    looks lived-in from day one.
    """
    created_agent_ids: List[str] = []
    runs_created = 0
    agent_id_by_slug: dict[str, str] = {}

    # ── 1. Create agents + specs ─────────────────────────────────────────────
    for agent_def in DEMO_AGENTS:
        aid = _ag()
        agent = AgentModel(
            id=aid,
            user_id=user_id,
            name=agent_def["name"],
            slug=agent_def["slug"],
            description=agent_def["description"],
            status="active",
            budget_daily_usd=agent_def["budget_daily_usd"],
        )
        db.add(agent)
        db.flush()

        spec = AgentSpecModel(
            id=_spec_id(),
            agent_id=aid,
            version=1,
            content=agent_def["spec"],
        )
        db.add(spec)
        db.flush()

        agent_id_by_slug[agent_def["slug"]] = aid
        created_agent_ids.append(aid)

    # ── 2. Create pre-seeded run history ─────────────────────────────────────
    for run_def in DEMO_RUNS:
        aid = agent_id_by_slug.get(run_def["agent_slug"])
        if not aid:
            continue

        created_at = _dt(run_def["ago"])
        run_status = run_def["status"]
        rid = _run_id()

        tokens_in = run_def.get("tokens_in", 0)
        tokens_out = run_def.get("tokens_out", 0)
        cost_usd = run_def.get("cost_usd", 0.0)
        latency_ms = run_def.get("latency_ms")
        error_msg = run_def.get("error_message")

        run = RunModel(
            id=rid,
            agent_id=aid,
            user_id=user_id,
            status=run_status,
            input=run_def["input"],
            source="vibe",
            model="gpt-4o-mini",
            provider="openai",
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            tokens_total=tokens_in + tokens_out,
            cost_estimate_usd=cost_usd if cost_usd > 0 else None,
            cost_is_approximate=False,
            latency_ms=latency_ms,
            error_message=error_msg,
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(run)
        db.flush()

        # ── Seed run events with staggered timestamps ────────────────────────
        _evt = _make_event_adder(db, rid, created_at)

        _evt(
            "system",
            {
                "message": "run_started",
                "model": "gpt-4o-mini",
                "provider": "openai",
            },
        )

        chunk_tokens: list[str] = run_def.get("tokens", [])

        if run_status in ("success", "cancelled"):
            emit = chunk_tokens if run_status == "success" else chunk_tokens[:4]
            for chunk in emit:
                _evt("token", {"text": chunk})

        if run_status == "success":
            _evt(
                "done",
                {
                    "ok": True,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                    "tokens_total": tokens_in + tokens_out,
                    "cost_estimate_usd": cost_usd if cost_usd > 0 else None,
                    "cost_is_approximate": False,
                    "latency_ms": latency_ms,
                },
            )
        elif run_status == "error":
            _evt("error", {"message": error_msg or "An unexpected error occurred."})
        elif run_status == "cancelled":
            _evt("cancelled", {"message": "Cancelled by user"})

        runs_created += 1

    db.commit()

    return SeedResponse(
        ok=True,
        agents_created=len(created_agent_ids),
        runs_created=runs_created,
        agent_ids=created_agent_ids,
        seeded_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        message=f"Demo data seeded — {len(created_agent_ids)} agents, {runs_created} runs.",
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/test")
async def dev_test():
    """Development test endpoint."""
    return {
        "message": "Development mode is enabled",
        "status": "dev",
        "env": "development",
    }


@router.get("/health")
async def dev_health():
    """Development health check with extra info."""
    return {
        "status": "healthy",
        "mode": "development",
        "dev_pages_enabled": os.getenv("ENABLE_DEV_PAGES", "0") == "1",
    }


@router.post("/seed", response_model=SeedResponse)
def seed_demo(
    req: SeedRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SeedResponse:
    """
    TASK-B1 + TASK-E3  —  Create (or re-create) demo agents and run history.

    force=false  idempotent: if demo data exists, raise 409 with "already_seeded"
                 so the frontend api.ts converts it to a soft-success.
    force=true   wipe and re-seed.
    """
    import traceback

    try:
        existing = _get_existing_demo_agents(db, user_id=current_user.id)

        if existing and not req.force:
            # TASK-E3: 409 path — frontend already handles this
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="already_seeded",
            )

        if req.force and existing:
            _purge_demo_data(db, user_id=current_user.id)

        result = _build_demo_data(db, user_id=current_user.id)

        # Provision shared guest user
        try:
            guest = _ensure_guest_user(db)
            result.guest_user_id = guest.id
        except Exception as guest_err:
            logger.warning("Guest user provisioning failed: %s", guest_err)

        # Write Pro workspace files
        try:
            result.files_written = _seed_workspace_files(force=req.force)
        except Exception as fs_err:
            logger.warning("Workspace file seeding failed: %s", fs_err)

        try:
            log_audit_event(
                db,
                user_id=current_user.id,
                event_type="demo.seeded",
                entity_type="user",
                entity_id=str(current_user.id),
                payload={
                    "agents_created": result.agents_created,
                    "runs_created": result.runs_created,
                    "force": req.force,
                },
            )
        except Exception:
            pass  # audit failure is never fatal

        return result

    except HTTPException:
        raise  # let FastAPI handle 409 / 403 etc. normally

    except Exception as exc:
        # Roll back any partial DB writes so the DB stays clean
        try:
            db.rollback()
        except Exception:
            pass

        tb = traceback.format_exc()
        logger.error("POST /dev/seed failed:\n%s", tb)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": type(exc).__name__,
                "message": str(exc),
                "traceback": tb.splitlines()[-8:],  # last 8 lines of traceback
            },
        ) from exc


@router.delete("/seed", response_model=DeleteSeedResponse)
def delete_seed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DeleteSeedResponse:
    """
    TASK-E4  —  Wipe all demo data for the current user.
    Safe to call when no demo data exists (returns 200 with zeros).
    Useful for CI teardown and manual cleanup.
    """
    agents_deleted, runs_deleted = _purge_demo_data(db, user_id=current_user.id)

    # Remove demo-* workspace directories, keep shared/
    try:
        dirs_deleted = _delete_demo_workspace_dirs()
    except Exception as fs_err:
        logger.warning("Workspace dir cleanup failed: %s", fs_err)
        dirs_deleted = 0

    try:
        log_audit_event(
            db,
            user_id=current_user.id,
            event_type="demo.deleted",
            entity_type="user",
            entity_id=str(current_user.id),
            payload={"agents_deleted": agents_deleted, "runs_deleted": runs_deleted, "dirs_deleted": dirs_deleted},
        )
    except Exception:
        pass

    return DeleteSeedResponse(
        ok=True,
        agents_deleted=agents_deleted,
        runs_deleted=runs_deleted,
        dirs_deleted=dirs_deleted,
        message=(
            f"Removed {agents_deleted} demo agent(s), {runs_deleted} run(s), {dirs_deleted} workspace dir(s)."
            if agents_deleted or dirs_deleted
            else "No demo data found for this user."
        ),
    )
