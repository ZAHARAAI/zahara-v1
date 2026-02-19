from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.audit_log import AuditLog as AuditLogModel
from ..models.user import User

router = APIRouter(prefix="/audit", tags=["audit"])


def _parse_dt(s: str) -> datetime:
    # Accept ISO8601 strings; Python handles many variants.
    try:
        # Allow trailing Z
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_datetime", "message": f"Invalid datetime: {s}"},
        )


class AuditItem(BaseModel):
    id: str
    user_id: int
    event_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    payload: Dict[str, Any] = {}
    created_at: str


class AuditListResponse(BaseModel):
    ok: bool = True
    items: List[AuditItem]
    total: int
    limit: int
    offset: int


@router.get("", response_model=AuditListResponse)
def list_audit(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = Query(None, alias="type"),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditListResponse:
    q = db.query(AuditLogModel).filter(AuditLogModel.user_id == current_user.id)

    if event_type:
        q = q.filter(AuditLogModel.event_type == event_type)
    if entity_type:
        q = q.filter(AuditLogModel.entity_type == entity_type)
    if entity_id:
        q = q.filter(AuditLogModel.entity_id == entity_id)

    if from_ts:
        dt = _parse_dt(from_ts)
        q = q.filter(AuditLogModel.created_at >= dt)
    if to_ts:
        dt = _parse_dt(to_ts)
        q = q.filter(AuditLogModel.created_at <= dt)

    total = q.count()
    rows = q.order_by(AuditLogModel.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for r in rows:
        items.append(
            AuditItem(
                id=r.id,
                user_id=r.user_id,
                event_type=r.event_type,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                payload=r.payload or {},
                created_at=r.created_at.isoformat().replace("+00:00", "Z"),
            )
        )

    return AuditListResponse(
        ok=True, items=items, total=total, limit=limit, offset=offset
    )
