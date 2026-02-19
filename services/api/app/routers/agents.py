from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Path,
    Query,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..middleware.run_rate_limit import enforce_run_start_rate_limit
from ..models.agent import Agent as AgentModel
from ..models.agent_spec import AgentSpec as AgentSpecModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..models.user import User
from ..services.audit import log_audit_event
from ..services.run_executor import execute_run_via_router

router = APIRouter(prefix="/agents", tags=["agents"])


def _dt_to_iso_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _utc_day_start(dt: datetime) -> datetime:
    # dt must be timezone-aware
    d = dt.astimezone(timezone.utc).date()
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def _slugify(name: str) -> str:
    slug = name.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    if not slug:
        slug = "agent"
    return slug


def _new_agent_id() -> str:
    """Generate a stable external agent id (similar to flows)."""
    return "ag_" + uuid4().hex[:10].upper()


def _new_run_id() -> str:
    """Generate a stable external run id."""
    return "run_" + uuid4().hex[:16]


def _new_spec_id() -> str:
    """Generate a stable external agent spec id."""
    return "as_" + uuid4().hex[:16]


def _get_agent_spend_today_usd(db: Session, *, user_id: int, agent_id: str) -> float:
    """
    Best-effort daily spend aggregation:
    sum runs.cost_estimate_usd for today (UTC) for this user+agent.
    """
    now = datetime.now(timezone.utc)
    start = _utc_day_start(now)

    total = (
        db.query(func.coalesce(func.sum(RunModel.cost_estimate_usd), 0.0))
        .filter(
            RunModel.user_id == user_id,
            RunModel.agent_id == agent_id,
            RunModel.created_at >= start,
        )
        .scalar()
    )

    try:
        return float(total or 0.0)
    except Exception:
        return 0.0


# helpers for job7 sprint
Period = Literal["7d", "30d", "all"]


def _parse_period(period: str) -> Period:
    if period not in {"7d", "30d", "all"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "ok": False,
                "error": {
                    "code": "INVALID_PERIOD",
                    "message": "period must be one of: 7d, 30d, all",
                },
            },
        )
    return period  # type: ignore


def _period_start(period: Period) -> Optional[datetime]:
    now = datetime.now(timezone.utc)
    if period == "all":
        return None
    days = 7 if period == "7d" else 30
    return now - timedelta(days=days)


def _day_floor_utc(dt: datetime) -> datetime:
    d = dt.astimezone(timezone.utc).date()
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def _utc_today_start() -> datetime:
    return _day_floor_utc(datetime.now(timezone.utc))


def _date_range_days(period: Period) -> List[datetime]:
    """
    Return list of UTC day starts for the requested chart period.
    For 'all', overview still wants a 7-day chart -> default to 7d.
    """
    if period == "all":
        period = "7d"
    now = datetime.now(timezone.utc)
    days = 7 if period == "7d" else 30
    start = _day_floor_utc(now - timedelta(days=days - 1))
    return [start + timedelta(days=i) for i in range(days)]


# ---------------------------
# Pydantic models (agents)
# ---------------------------


class AgentCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    spec: Dict[str, Any] = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    # Job7: allow lifecycle + budget updates from UI (optional but practical)
    status: Optional[str] = None  # active | paused | retired
    budget_daily_usd: Optional[float] = None  # null/None means no cap


class AgentSpecCreate(BaseModel):
    spec: Dict[str, Any] = Field(default_factory=dict)


class AgentItem(BaseModel):
    id: str
    user_id: int
    name: str
    slug: str
    description: Optional[str] = None
    # Job7: surface lifecycle + budget for UI
    status: Optional[str] = None
    budget_daily_usd: Optional[float] = None
    created_at: str
    updated_at: str


class AgentDetailResponse(BaseModel):
    ok: bool = True
    agent: AgentItem
    spec: Optional[Dict[str, Any]] = None
    spec_version: Optional[int] = None


class AgentListResponse(BaseModel):
    ok: bool = True
    items: List[AgentItem]


# ---------------------------
# Pydantic models (runs)
# ---------------------------


class RunRequest(BaseModel):
    """
    run request payload (used by web/services/job6.ts)
    """

    input: str = Field(..., description="User input or message for the agent.")
    source: str = Field(
        "vibe", description="Run source: vibe | pro | flow | agui | api | clinic"
    )
    config: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional execution config to persist on the run."
    )


class RunResponse(BaseModel):
    ok: bool = True
    run_id: str
    request_id: str


class AgentKillResponse(BaseModel):
    ok: bool = True
    agent_id: str
    status: str
    cancelled_runs: int = 0


# ----------------------------
# response models for job7-sprint
# ----------------------------


class RunsByDayPoint(BaseModel):
    date: str  # YYYY-MM-DD
    runs: int
    success: int
    error: int
    cancelled: int
    cost_usd: float
    tokens_total: int


class AgentStatsSummaryResponse(BaseModel):
    ok: bool = True

    total_runs: int
    success_rate: float  # 0..1
    tokens_total: int
    cost_total_usd: float
    avg_latency_ms: float
    p95_latency_ms: float

    runs_by_day: List[RunsByDayPoint]


class AgentStatsItem(BaseModel):
    agent_id: str
    name: str
    slug: str
    status: Optional[str] = None
    budget_daily_usd: Optional[float] = None

    # ✅ Job7 agents page needs "used today" for budget progress
    spent_today_usd: float = 0.0

    runs: int
    success_rate: float
    tokens_total: int
    cost_total_usd: float
    avg_latency_ms: float
    p95_latency_ms: float


class AgentStatsBatchResponse(BaseModel):
    ok: bool = True
    items: List[AgentStatsItem]


class AgentStatsDetailResponse(BaseModel):
    ok: bool = True
    agent_id: str
    period: str

    runs: int
    success_rate: float
    tokens_total: int
    cost_total_usd: float
    avg_latency_ms: float
    p95_latency_ms: float


def _to_agent_item(model: AgentModel) -> AgentItem:
    return AgentItem(
        id=model.id,
        user_id=model.user_id,
        name=model.name,
        slug=model.slug,
        description=model.description,
        status=getattr(model, "status", None),
        budget_daily_usd=float(getattr(model, "budget_daily_usd", 0) or 0)
        if getattr(model, "budget_daily_usd", None) is not None
        else None,
        created_at=_dt_to_iso_z(model.created_at),
        updated_at=_dt_to_iso_z(model.updated_at),
    )


@router.get("", response_model=AgentListResponse)
def list_agents(
    q: Optional[str] = Query(None, description="Optional search query"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentListResponse:
    query = db.query(AgentModel).filter(AgentModel.user_id == current_user.id)
    if q:
        query = query.filter(AgentModel.name.ilike(f"%{q}%"))
    rows = query.order_by(AgentModel.created_at.desc()).all()
    return AgentListResponse(ok=True, items=[_to_agent_item(a) for a in rows])


@router.post("", response_model=AgentDetailResponse)
def create_agent(
    body: AgentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetailResponse:
    try:
        name = body.name.strip() if body.name else None
        slug = body.slug.strip() if body.slug else name

        if not name:
            raise HTTPException(
                status_code=400,
                detail={
                    "ok": False,
                    "error": {"code": "INVALID", "message": "name is required"},
                },
            )

        # If agent exists with same user_id and slug -> return existing
        agent = (
            db.query(AgentModel)
            .filter(
                AgentModel.slug == _slugify(slug),
                AgentModel.user_id == current_user.id,
            )
            .first()
        )

        if agent:
            last_spec = (
                db.query(AgentSpecModel)
                .filter(AgentSpecModel.agent_id == agent.id)
                .order_by(AgentSpecModel.version.desc())
                .first()
            )

            return AgentDetailResponse(
                ok=True,
                agent=_to_agent_item(agent),
                spec=last_spec.content if last_spec else None,
                spec_version=last_spec.version if last_spec else None,
            )

        agent_id = _new_agent_id()
        agent = AgentModel(
            id=agent_id,
            user_id=current_user.id,
            name=name,
            slug=_slugify(slug),
            description=body.description.strip() if body.description else None,
        )
        db.add(agent)
        db.commit()
        db.refresh(agent)

        spec_row = AgentSpecModel(
            id=_new_spec_id(),
            agent_id=agent.id,
            version=1,
            content=body.spec or {},
        )
        db.add(spec_row)
        db.commit()
        db.refresh(spec_row)

        # Audit: agent created (safe metadata only)
        try:
            log_audit_event(
                db,
                user_id=current_user.id,
                event_type="agent.created",
                entity_type="agent",
                entity_id=agent.id,
                payload={"slug": agent.slug, "name": agent.name},
            )
        except Exception:
            db.rollback()

        return AgentDetailResponse(
            ok=True,
            agent=_to_agent_item(agent),
            spec=spec_row.content if spec_row else None,
            spec_version=spec_row.version if spec_row else None,
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.get("/{agent_id}", response_model=AgentDetailResponse)
def get_agent(
    agent_id: str = Path(..., pattern=r"^ag_[A-Z0-9]+$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetailResponse:
    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    spec_row = (
        db.query(AgentSpecModel)
        .filter(AgentSpecModel.agent_id == agent.id)
        .order_by(AgentSpecModel.version.desc())
        .first()
    )

    return AgentDetailResponse(
        ok=True,
        agent=_to_agent_item(agent),
        spec=spec_row.content if spec_row else None,
        spec_version=spec_row.version if spec_row else None,
    )


@router.patch("/{agent_id}", response_model=AgentDetailResponse)
def update_agent(
    agent_id: str,
    body: AgentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetailResponse:
    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(
                status_code=400,
                detail={
                    "ok": False,
                    "error": {"code": "INVALID", "message": "name cannot be empty"},
                },
            )
        agent.name = name
        agent.slug = _slugify(name)

    if body.description is not None:
        agent.description = body.description.strip() if body.description else None

    if body.status is not None:
        allowed = {"active", "paused", "retired"}
        if body.status not in allowed:
            raise HTTPException(
                status_code=400,
                detail={
                    "ok": False,
                    "error": {
                        "code": "INVALID",
                        "message": f"Invalid status '{body.status}'. Allowed: {sorted(allowed)}",
                    },
                },
            )
        agent.status = body.status

    if body.budget_daily_usd is not None:
        if body.budget_daily_usd < 0:
            raise HTTPException(
                status_code=400,
                detail={
                    "ok": False,
                    "error": {
                        "code": "INVALID",
                        "message": "budget_daily_usd must be >= 0",
                    },
                },
            )
        agent.budget_daily_usd = body.budget_daily_usd

    db.add(agent)
    db.commit()
    db.refresh(agent)

    # Audit: agent updated (safe metadata only)
    try:
        log_audit_event(
            db,
            user_id=current_user.id,
            event_type="agent.updated",
            entity_type="agent",
            entity_id=agent.id,
            payload={
                "status": getattr(agent, "status", None),
                "budget_daily_usd": float(getattr(agent, "budget_daily_usd", 0) or 0)
                if getattr(agent, "budget_daily_usd", None) is not None
                else None,
            },
        )
    except Exception:
        db.rollback()

    spec_row = (
        db.query(AgentSpecModel)
        .filter(AgentSpecModel.agent_id == agent.id)
        .order_by(AgentSpecModel.version.desc())
        .first()
    )

    return AgentDetailResponse(
        ok=True,
        agent=_to_agent_item(agent),
        spec=spec_row.content if spec_row else None,
        spec_version=spec_row.version if spec_row else None,
    )


@router.post("/{agent_id}/spec", response_model=AgentDetailResponse)
def create_agent_spec_version(
    agent_id: str,
    body: AgentSpecCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetailResponse:
    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    latest = (
        db.query(AgentSpecModel)
        .filter(AgentSpecModel.agent_id == agent.id)
        .order_by(AgentSpecModel.version.desc())
        .first()
    )
    next_version = 1 if not latest else int(latest.version) + 1

    spec_row = AgentSpecModel(
        id=_new_spec_id(),
        agent_id=agent.id,
        version=next_version,
        content=body.spec or {},
    )
    db.add(spec_row)
    db.commit()
    db.refresh(spec_row)

    # Audit: spec version created
    try:
        log_audit_event(
            db,
            user_id=current_user.id,
            event_type="agent.spec_created",
            entity_type="agent",
            entity_id=agent.id,
            payload={"version": next_version},
        )
    except Exception:
        db.rollback()

    return AgentDetailResponse(
        ok=True,
        agent=_to_agent_item(agent),
        spec=spec_row.content if spec_row else None,
        spec_version=spec_row.version if spec_row else None,
    )


# ---------------------------
# POST /agents/{id}/run  (run pipeline entrypoint)
# ---------------------------


@router.post(
    "/{agent_id}/run",
    response_model=RunResponse,
    dependencies=[Depends(enforce_run_start_rate_limit)],
)
def start_agent_run(
    agent_id: str,
    body: RunRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunResponse:
    """
    run pipeline entrypoint.

    - Creates a run row (pending->running->success|error)
    - Creates initial run events
    - Kicks off background execution via the central router
    - Returns run_id and request_id for SSE subscription
    """
    agent: AgentModel | None = (
        db.query(AgentModel)
        .filter(
            AgentModel.id == agent_id,
            AgentModel.user_id == current_user.id,
        )
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    # --- Job7: lifecycle enforcement (409 if not active) ---
    if getattr(agent, "status", "active") != "active":
        raise HTTPException(
            status_code=409,
            detail={
                "ok": False,
                "error": {
                    "code": "AGENT_NOT_ACTIVE",
                    "message": f"Agent is {agent.status}. Activate it to run.",
                },
            },
        )

    # --- Job7: best-effort daily budget enforcement ---
    budget = getattr(agent, "budget_daily_usd", None)
    if budget is not None:
        try:
            budget_val = float(budget)
        except Exception:
            budget_val = None

        if budget_val is not None and budget_val >= 0:
            spent = _get_agent_spend_today_usd(
                db, user_id=current_user.id, agent_id=agent.id
            )
            if spent >= budget_val:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "ok": False,
                        "error": {
                            "code": "BUDGET_EXCEEDED",
                            "message": "Daily budget exceeded for this agent.",
                            "meta": {
                                "budget_daily_usd": budget_val,
                                "spent_today_usd": spent,
                            },
                        },
                    },
                )

    run_id = _new_run_id()
    request_id = str(uuid4())

    run = RunModel(
        id=run_id,
        agent_id=agent.id,
        user_id=current_user.id,
        request_id=request_id,
        status="pending",
        source=body.source,
        input=body.input,
        config=body.config,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    db.add(
        RunEventModel(
            run_id=run.id,
            type="system",
            payload={"event": "run_created", "request_id": request_id},
        )
    )
    db.commit()

    # Audit: run started (safe metadata only)
    try:
        log_audit_event(
            db,
            user_id=current_user.id,
            event_type="run.started",
            entity_type="run",
            entity_id=run.id,
            payload={
                "agent_id": agent.id,
                "source": body.source,
                "request_id": request_id,
            },
        )
    except Exception:
        db.rollback()

    background_tasks.add_task(execute_run_via_router, run.id)

    return RunResponse(ok=True, run_id=run.id, request_id=request_id)


@router.patch("/{agent_id}/kill", response_model=AgentKillResponse)
def kill_agent(
    agent_id: str = Path(..., pattern=r"^ag_[A-Z0-9]+$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentKillResponse:
    """
    Job7 kill endpoint:
    - pause agent
    - cancel running/pending runs
    - append cancelled events
    - audit
    """
    agent: AgentModel | None = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    # If already paused/retired, still proceed to cancel in-flight runs (safe)
    agent.status = "paused"
    db.add(agent)

    # Cancel in-flight runs in one go
    runs = (
        db.query(RunModel)
        .filter(
            RunModel.user_id == current_user.id,
            RunModel.agent_id == agent.id,
            RunModel.status.in_(["pending", "running"]),
        )
        .all()
    )

    cancelled = 0
    for r in runs:
        # Mark cancelled
        r.status = "cancelled"
        r.error_message = "Cancelled by agent kill"
        db.add(r)

        # Add event (SSE will end on cancelled)
        db.add(
            RunEventModel(
                run_id=r.id,
                type="cancelled",
                payload={
                    "message": "Cancelled by agent kill",
                    "request_id": r.request_id,
                },
            )
        )

        cancelled += 1

        # Audit per run cancel (no commit here)
        log_audit_event(
            db,
            user_id=current_user.id,
            event_type="run.cancelled",
            entity_type="run",
            entity_id=r.id,
            payload={"agent_id": agent.id, "reason": "agent_kill"},
            commit=False,
        )

    # Audit agent kill (no commit here)
    log_audit_event(
        db,
        user_id=current_user.id,
        event_type="agent.killed",
        entity_type="agent",
        entity_id=agent.id,
        payload={"cancelled_runs": cancelled},
        commit=False,
    )

    # ✅ Single commit for all changes
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"ok": False, "error": {"code": "KILL_FAILED", "message": str(e)}},
        )

    db.refresh(agent)

    return AgentKillResponse(
        ok=True, agent_id=agent.id, status=agent.status, cancelled_runs=cancelled
    )


@router.delete("/{agent_id}")
def delete_agent(
    agent_id: str = Path(..., pattern=r"^ag_[A-Z0-9]+$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    # delete run_events for runs of this agent
    run_ids = [
        r[0] for r in db.query(RunModel.id).filter(RunModel.agent_id == agent.id).all()
    ]
    if run_ids:
        db.query(RunEventModel).filter(RunEventModel.run_id.in_(run_ids)).delete(
            synchronize_session=False
        )

    # delete runs
    db.query(RunModel).filter(RunModel.agent_id == agent.id).delete(
        synchronize_session=False
    )

    # delete all agent specs (all versions)
    db.query(AgentSpecModel).filter(AgentSpecModel.agent_id == agent.id).delete(
        synchronize_session=False
    )

    # delete agent
    db.delete(agent)
    db.commit()

    # Audit: agent deleted
    try:
        log_audit_event(
            db,
            user_id=current_user.id,
            event_type="agent.deleted",
            entity_type="agent",
            entity_id=agent.id,
            payload={},
        )
    except Exception:
        db.rollback()

    return {"ok": True, "deleted": True}


# ----------------------------
# endpoints for job7 sprint
# ----------------------------


@router.get("/stats", response_model=AgentStatsBatchResponse)
def stats_batch(
    period: str = Query("7d", description="7d | 30d | all"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentStatsBatchResponse:
    """
    Job7:
    GET /agents/stats?period=7d
    Returns per-agent stat objects (batch) to avoid N+1.
    Includes spent_today_usd for budget progress.
    """
    p = _parse_period(period)
    start = _period_start(p)

    base_filter = [RunModel.user_id == current_user.id]
    if start is not None:
        base_filter.append(RunModel.created_at >= start)

    # Subquery 1: runs/success/tokens/cost (includes latency NULL rows)
    agg_main = (
        db.query(
            RunModel.agent_id.label("agent_id"),
            func.count(RunModel.id).label("runs"),
            func.coalesce(
                func.sum(case((RunModel.status == "success", 1), else_=0)), 0
            ).label("success"),
            func.coalesce(func.sum(RunModel.tokens_total), 0).label("tokens_total"),
            func.coalesce(func.sum(RunModel.cost_estimate_usd), 0.0).label(
                "cost_total_usd"
            ),
        )
        .filter(*base_filter)
        .group_by(RunModel.agent_id)
        .subquery()
    )

    # Subquery 2: latency metrics only where latency_ms NOT NULL
    latency_filter = list(base_filter) + [RunModel.latency_ms.isnot(None)]
    agg_latency = (
        db.query(
            RunModel.agent_id.label("agent_id"),
            func.coalesce(func.avg(RunModel.latency_ms), 0.0).label("avg_latency_ms"),
            func.percentile_cont(0.95)
            .within_group(RunModel.latency_ms)
            .label("p95_latency_ms"),
        )
        .filter(*latency_filter)
        .group_by(RunModel.agent_id)
        .subquery()
    )

    # Subquery 3: today's spend (UTC day) — for budget progress
    today_start = _utc_today_start()
    agg_today = (
        db.query(
            RunModel.agent_id.label("agent_id"),
            func.coalesce(func.sum(RunModel.cost_estimate_usd), 0.0).label(
                "spent_today_usd"
            ),
        )
        .filter(
            RunModel.user_id == current_user.id,
            RunModel.created_at >= today_start,
        )
        .group_by(RunModel.agent_id)
        .subquery()
    )

    rows = (
        db.query(
            AgentModel.id.label("agent_id"),
            AgentModel.name,
            AgentModel.slug,
            getattr(AgentModel, "status", None),
            getattr(AgentModel, "budget_daily_usd", None),
            func.coalesce(agg_today.c.spent_today_usd, 0.0).label("spent_today_usd"),
            func.coalesce(agg_main.c.runs, 0).label("runs"),
            func.coalesce(agg_main.c.success, 0).label("success"),
            func.coalesce(agg_main.c.tokens_total, 0).label("tokens_total"),
            func.coalesce(agg_main.c.cost_total_usd, 0.0).label("cost_total_usd"),
            func.coalesce(agg_latency.c.avg_latency_ms, 0.0).label("avg_latency_ms"),
            func.coalesce(agg_latency.c.p95_latency_ms, 0.0).label("p95_latency_ms"),
        )
        .outerjoin(agg_main, agg_main.c.agent_id == AgentModel.id)
        .outerjoin(agg_latency, agg_latency.c.agent_id == AgentModel.id)
        .outerjoin(agg_today, agg_today.c.agent_id == AgentModel.id)
        .filter(AgentModel.user_id == current_user.id)
        .order_by(AgentModel.created_at.desc())
        .all()
    )

    items: List[AgentStatsItem] = []
    for r in rows:
        runs = int(r.runs or 0)
        success = int(r.success or 0)
        success_rate = (success / runs) if runs > 0 else 0.0

        budget_val = None
        if r.budget_daily_usd is not None:
            try:
                budget_val = float(r.budget_daily_usd)
            except Exception:
                budget_val = None

        status_val = None
        try:
            status_val = r.status
        except Exception:
            status_val = None

        items.append(
            AgentStatsItem(
                agent_id=r.agent_id,
                name=r.name,
                slug=r.slug,
                status=status_val,
                budget_daily_usd=budget_val,
                spent_today_usd=float(r.spent_today_usd or 0.0),
                runs=runs,
                success_rate=success_rate,
                tokens_total=int(r.tokens_total or 0),
                cost_total_usd=float(r.cost_total_usd or 0.0),
                avg_latency_ms=float(r.avg_latency_ms or 0.0),
                p95_latency_ms=float(r.p95_latency_ms or 0.0),
            )
        )

    return AgentStatsBatchResponse(ok=True, items=items)


@router.get("/stats/summary", response_model=AgentStatsSummaryResponse)
def stats_summary(
    period: str = Query("7d", description="7d | 30d | all"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentStatsSummaryResponse:
    """
    Job7:
    GET /agents/stats/summary?period=7d
    Returns a single object for KPI cards + chart.
    """
    p = _parse_period(period)
    start = _period_start(p)

    base_filter = [RunModel.user_id == current_user.id]
    if start is not None:
        base_filter.append(RunModel.created_at >= start)

    total_runs = db.query(func.count(RunModel.id)).filter(*base_filter).scalar() or 0
    total_runs = int(total_runs)

    counts = (
        db.query(
            func.coalesce(
                func.sum(case((RunModel.status == "success", 1), else_=0)), 0
            ),
            func.coalesce(func.sum(case((RunModel.status == "error", 1), else_=0)), 0),
            func.coalesce(
                func.sum(case((RunModel.status == "cancelled", 1), else_=0)), 0
            ),
        )
        .filter(*base_filter)
        .one()
    )
    success_cnt, error_cnt, cancelled_cnt = (  # noqa: F841
        int(counts[0] or 0),
        int(counts[1] or 0),
        int(counts[2] or 0),
    )

    sums = (
        db.query(
            func.coalesce(func.sum(RunModel.tokens_total), 0),
            func.coalesce(func.sum(RunModel.cost_estimate_usd), 0.0),
        )
        .filter(*base_filter)
        .one()
    )
    tokens_total = int(sums[0] or 0)
    cost_total_usd = float(sums[1] or 0.0)

    latency_filter = list(base_filter) + [RunModel.latency_ms.isnot(None)]
    avg_latency_ms = (
        db.query(func.coalesce(func.avg(RunModel.latency_ms), 0.0))
        .filter(*latency_filter)
        .scalar()
        or 0.0
    )
    avg_latency_ms = float(avg_latency_ms)

    p95_latency_ms = (
        db.query(func.percentile_cont(0.95).within_group(RunModel.latency_ms))
        .filter(*latency_filter)
        .scalar()
        or 0.0
    )
    p95_latency_ms = float(p95_latency_ms)

    success_rate = (success_cnt / total_runs) if total_runs > 0 else 0.0

    # --- chart runs_by_day ---
    days = _date_range_days(p)
    chart_start = days[0]
    chart_end = days[-1] + timedelta(days=1)

    chart_rows = (
        db.query(
            func.date_trunc("day", RunModel.created_at).label("day"),
            func.count(RunModel.id).label("runs"),
            func.coalesce(
                func.sum(case((RunModel.status == "success", 1), else_=0)), 0
            ).label("success"),
            func.coalesce(
                func.sum(case((RunModel.status == "error", 1), else_=0)), 0
            ).label("error"),
            func.coalesce(
                func.sum(case((RunModel.status == "cancelled", 1), else_=0)), 0
            ).label("cancelled"),
            func.coalesce(func.sum(RunModel.cost_estimate_usd), 0.0).label("cost_usd"),
            func.coalesce(func.sum(RunModel.tokens_total), 0).label("tokens_total"),
        )
        .filter(
            RunModel.user_id == current_user.id,
            RunModel.created_at >= chart_start,
            RunModel.created_at < chart_end,
        )
        .group_by("day")
        .order_by("day")
        .all()
    )

    by_day: Dict[str, RunsByDayPoint] = {}
    for r in chart_rows:
        day_dt: datetime = r.day
        key = day_dt.date().isoformat()
        by_day[key] = RunsByDayPoint(
            date=key,
            runs=int(r.runs or 0),
            success=int(r.success or 0),
            error=int(r.error or 0),
            cancelled=int(r.cancelled or 0),
            cost_usd=float(r.cost_usd or 0.0),
            tokens_total=int(r.tokens_total or 0),
        )

    runs_by_day: List[RunsByDayPoint] = []
    for d in days:
        key = d.date().isoformat()
        runs_by_day.append(
            by_day.get(
                key,
                RunsByDayPoint(
                    date=key,
                    runs=0,
                    success=0,
                    error=0,
                    cancelled=0,
                    cost_usd=0.0,
                    tokens_total=0,
                ),
            )
        )

    return AgentStatsSummaryResponse(
        ok=True,
        total_runs=total_runs,
        success_rate=success_rate,
        tokens_total=tokens_total,
        cost_total_usd=cost_total_usd,
        avg_latency_ms=avg_latency_ms,
        p95_latency_ms=p95_latency_ms,
        runs_by_day=runs_by_day,
    )


@router.get("/{agent_id}/stats", response_model=AgentStatsDetailResponse)
def stats_single_agent(
    agent_id: str = Path(..., pattern=r"^ag_[A-Z0-9]+$"),
    period: str = Query("7d", description="7d | 30d | all"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentStatsDetailResponse:
    """
    Job7:
    GET /agents/{agent_id}/stats?period=7d|30d|all
    Includes runs, success rate, tokens, cost, avg latency, p95 latency.
    """
    p = _parse_period(period)
    start = _period_start(p)

    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    base_filter = [
        RunModel.user_id == current_user.id,
        RunModel.agent_id == agent_id,
    ]
    if start is not None:
        base_filter.append(RunModel.created_at >= start)

    runs = db.query(func.count(RunModel.id)).filter(*base_filter).scalar() or 0
    runs = int(runs)

    success = (
        db.query(
            func.coalesce(func.sum(case((RunModel.status == "success", 1), else_=0)), 0)
        )
        .filter(*base_filter)
        .scalar()
        or 0
    )
    success = int(success)

    sums = (
        db.query(
            func.coalesce(func.sum(RunModel.tokens_total), 0),
            func.coalesce(func.sum(RunModel.cost_estimate_usd), 0.0),
        )
        .filter(*base_filter)
        .one()
    )
    tokens_total = int(sums[0] or 0)
    cost_total_usd = float(sums[1] or 0.0)

    latency_filter = list(base_filter) + [RunModel.latency_ms.isnot(None)]
    avg_latency_ms = (
        db.query(func.coalesce(func.avg(RunModel.latency_ms), 0.0))
        .filter(*latency_filter)
        .scalar()
        or 0.0
    )
    avg_latency_ms = float(avg_latency_ms)

    p95_latency_ms = (
        db.query(func.percentile_cont(0.95).within_group(RunModel.latency_ms))
        .filter(*latency_filter)
        .scalar()
        or 0.0
    )
    p95_latency_ms = float(p95_latency_ms)

    success_rate = (success / runs) if runs > 0 else 0.0

    return AgentStatsDetailResponse(
        ok=True,
        agent_id=agent_id,
        period=p,
        runs=runs,
        success_rate=success_rate,
        tokens_total=tokens_total,
        cost_total_usd=cost_total_usd,
        avg_latency_ms=avg_latency_ms,
        p95_latency_ms=p95_latency_ms,
    )
