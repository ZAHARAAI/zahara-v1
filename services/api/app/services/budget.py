"""Budget enforcement helpers.

Job7 requires best-effort per-agent daily budget enforcement.

Design goals:
- Keep *all* budget logic in one place.
- Use existing run cost when available.
- If cost isn't stored yet, estimate cost from token counts using services.pricing.
- Operate in UTC day boundaries.

NOTE: This is intentionally best-effort (no strict locking) for beta.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.run import Run as RunModel
from .pricing import estimate_cost_usd


def utc_today_start(now: Optional[datetime] = None) -> datetime:
    """UTC start-of-day for `now` (or current time)."""
    if now is None:
        now = datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    d = now.astimezone(timezone.utc).date()
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def utc_today_range(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    start = utc_today_start(now)
    end = start + timedelta(days=1)
    return start, end


@dataclass
class BudgetMeta:
    budget_daily_usd: float
    spent_today_usd: float
    percent_used: int
    is_approximate: bool = False

    def as_dict(self) -> Dict[str, Any]:
        return {
            "budget_daily_usd": float(self.budget_daily_usd),
            "spent_today_usd": float(self.spent_today_usd),
            "percent_used": int(self.percent_used),
            "is_approximate": bool(self.is_approximate),
        }


def _estimate_run_cost_usd(run: RunModel) -> Optional[float]:
    """Estimate a single run's cost from stored tokens using pricing table."""
    if not run.model:
        return None

    prompt = run.tokens_in
    completion = run.tokens_out
    total = run.tokens_total

    usage: Dict[str, Any] = {}
    if isinstance(prompt, int) and isinstance(completion, int):
        usage["prompt_tokens"] = prompt
        usage["completion_tokens"] = completion
        usage["total_tokens"] = prompt + completion
    elif isinstance(total, int):
        usage["total_tokens"] = total

    if not usage:
        return None

    return estimate_cost_usd(run.model, usage)


def get_agent_spend_today_usd(
    db: Session, *, user_id: int, agent_id: str, now: Optional[datetime] = None
) -> Tuple[float, bool]:
    """Return (spent_today_usd, is_approximate).

    Primary path: sum stored Run.cost_estimate_usd.
    Fallback path: if some runs have NULL cost_estimate_usd, estimate from tokens.
    """

    start, end = utc_today_range(now)

    # 1) Sum stored cost estimates
    stored_sum = (
        db.query(func.coalesce(func.sum(RunModel.cost_estimate_usd), 0.0))
        .filter(
            RunModel.user_id == user_id,
            RunModel.agent_id == agent_id,
            RunModel.created_at >= start,
            RunModel.created_at < end,
        )
        .scalar()
        or 0.0
    )

    spent = float(stored_sum or 0.0)
    is_approx = False

    # 2) Add best-effort estimates for runs missing cost_estimate_usd
    #    (keep this small and safe; beta requirement is best-effort)
    missing = (
        db.query(RunModel)
        .filter(
            RunModel.user_id == user_id,
            RunModel.agent_id == agent_id,
            RunModel.created_at >= start,
            RunModel.created_at < end,
            RunModel.cost_estimate_usd.is_(None),
        )
        .limit(200)
        .all()
    )

    for r in missing:
        est = _estimate_run_cost_usd(r)
        if est is not None:
            spent += float(est)
            is_approx = True

    # clamp
    if spent < 0:
        spent = 0.0

    return spent, is_approx


def get_spend_today_by_agent_ids(
    db: Session,
    *,
    user_id: int,
    agent_ids: Optional[Iterable[str]] = None,
    now: Optional[datetime] = None,
) -> Tuple[Dict[str, float], Dict[str, bool]]:
    """Return per-agent spend for today as (spent_map, approx_map).

    This is used by Job7 agent stats pages to show budget progress without N+1.

    Primary path: use Run.cost_estimate_usd when present.
    Fallback path: for rows where cost_estimate_usd is NULL, estimate from tokens
    via services.pricing.

    Notes:
    - Best-effort: we cap the fetched rows to keep the query safe for beta.
    - Operates in UTC day boundaries.
    """

    start, end = utc_today_range(now)

    q = (
        db.query(
            RunModel.agent_id,
            RunModel.cost_estimate_usd,
            RunModel.model,
            RunModel.tokens_in,
            RunModel.tokens_out,
            RunModel.tokens_total,
        )
        .filter(
            RunModel.user_id == user_id,
            RunModel.created_at >= start,
            RunModel.created_at < end,
            RunModel.agent_id.isnot(None),
        )
        .limit(2000)
    )

    if agent_ids is not None:
        ids = list(agent_ids)
        if ids:
            q = q.filter(RunModel.agent_id.in_(ids))
        else:
            return {}, {}

    spent_map: Dict[str, float] = {}
    approx_map: Dict[str, bool] = {}

    rows = q.all()
    for aid, cost, model, t_in, t_out, t_total in rows:
        if not aid:
            continue

        spent_map.setdefault(aid, 0.0)
        approx_map.setdefault(aid, False)

        if cost is not None:
            try:
                spent_map[aid] += float(cost)
            except Exception:
                # ignore malformed cost
                pass
            continue

        # fallback estimate
        if not model:
            continue

        usage: Dict[str, Any] = {}
        if isinstance(t_in, int) and isinstance(t_out, int):
            usage["prompt_tokens"] = t_in
            usage["completion_tokens"] = t_out
            usage["total_tokens"] = t_in + t_out
        elif isinstance(t_total, int):
            usage["total_tokens"] = t_total

        if not usage:
            continue

        try:
            est = estimate_cost_usd(str(model), usage)
        except Exception:
            est = None

        if est is not None:
            spent_map[aid] += float(est)
            approx_map[aid] = True

    # clamp negatives just in case
    for k, v in list(spent_map.items()):
        if v < 0:
            spent_map[k] = 0.0

    return spent_map, approx_map


def evaluate_agent_budget(
    db: Session,
    *,
    user_id: int,
    agent_id: str,
    budget_daily_usd: Optional[float],
    warn_threshold: float = 0.80,
) -> Tuple[Optional[BudgetMeta], bool]:
    """Return (meta, exceeded).

    - If budget_daily_usd is None: (None, False)
    - exceeded if spent_today_usd >= budget_daily_usd
    """

    if budget_daily_usd is None:
        return None, False

    # Treat negative budgets as no-cap; validation should prevent this anyway.
    try:
        cap = float(budget_daily_usd)
    except Exception:
        return None, False

    if cap <= 0:
        # Cap at 0 means effectively no runs allowed; still compute meta.
        spent, is_approx = get_agent_spend_today_usd(
            db, user_id=user_id, agent_id=agent_id
        )
        percent = 100 if spent > 0 else 0
        return BudgetMeta(
            budget_daily_usd=cap,
            spent_today_usd=spent,
            percent_used=percent,
            is_approximate=is_approx,
        ), spent >= cap

    spent, is_approx = get_agent_spend_today_usd(db, user_id=user_id, agent_id=agent_id)

    percent = int(round((spent / cap) * 100)) if cap > 0 else 0
    if percent < 0:
        percent = 0

    meta = BudgetMeta(
        budget_daily_usd=cap,
        spent_today_usd=spent,
        percent_used=percent,
        is_approximate=is_approx,
    )

    exceeded = spent >= cap

    # Note: warn_threshold is used by callers (UI toast); we include percent anyway.
    return meta, exceeded
