from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.daily_usage import DailyUsage
from ..models.user import User

router = APIRouter(prefix="/usage", tags=["usage"])


class DailyUsageItem(BaseModel):
    day: str
    runs_count: int
    tokens_total: int
    cost_usd: float


class DailyUsageResponse(BaseModel):
    ok: bool = True
    items: List[DailyUsageItem]


def _iso(d: date) -> str:
    return d.isoformat()


@router.get("/daily", response_model=DailyUsageResponse)
def daily_usage(
    start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyUsageResponse:
    q = db.query(DailyUsage).filter(DailyUsage.user_id == current_user.id)

    if start:
        q = q.filter(DailyUsage.day >= date.fromisoformat(start))
    if end:
        q = q.filter(DailyUsage.day <= date.fromisoformat(end))

    rows = q.order_by(DailyUsage.day.desc()).limit(400).all()
    return DailyUsageResponse(
        ok=True,
        items=[
            DailyUsageItem(
                day=_iso(r.day),
                runs_count=r.runs_count,
                tokens_total=r.tokens_total,
                cost_usd=float(r.cost_usd),
            )
            for r in rows
        ],
    )
