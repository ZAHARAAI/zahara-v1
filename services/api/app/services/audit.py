from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from ..models.audit_log import AuditLog


def _new_audit_id() -> str:
    return "al_" + uuid4().hex[:16]


def log_audit_event(
    db: Session,
    *,
    user_id: int,
    event_type: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    commit: bool = True,  # ✅ new
) -> None:
    """
    Insert an audit log row.

    IMPORTANT:
    - Never log provider key values or decrypted secrets.
    """
    row = AuditLog(
        id=_new_audit_id(),
        user_id=user_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
    )
    db.add(row)
    if commit:
        db.commit()
