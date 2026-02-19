from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.agent import Agent as AgentModel
from ..models.run import Run as RunModel
from ..models.user import User

router = APIRouter(prefix="/agents", tags=["agents-stats"])

Period = Literal["7d", "30d", "all"]


# ----------------------------
# helpers
# ----------------------------


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


# ----------------------------
# response models
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


# ----------------------------
# endpoints
# ----------------------------


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


@router.get("/{agent_id}/stats", response_model=AgentStatsDetailResponse)
def stats_single_agent(
    agent_id: str,
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
