from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from ..models.daily_usage import DailyUsage


def _utc_day(d: datetime | None = None) -> date:
    d = d or datetime.now(timezone.utc)
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).date()


def upsert_daily_usage(
    *,
    db: Session,
    user_id: int,
    tokens_total: int | None,
    cost_usd: float | None,
    day: date | None = None,
) -> None:
    day = day or _utc_day()
    tokens_total = int(tokens_total or 0)
    cost_usd = float(cost_usd or 0.0)

    row = (
        db.query(DailyUsage)
        .filter(DailyUsage.user_id == user_id, DailyUsage.day == day)
        .first()
    )
    if not row:
        row = DailyUsage(
            user_id=user_id,
            day=day,
            runs_count=1,
            tokens_total=tokens_total,
            cost_usd=cost_usd,
        )
        db.add(row)
        db.commit()
        return

    row.runs_count += 1
    row.tokens_total += tokens_total
    row.cost_usd += cost_usd
    db.add(row)
    db.commit()
