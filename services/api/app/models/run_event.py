from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import uuid4

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Session

from ..database import Base


class RunEvent(Base):
    __tablename__ = "run_events"

    id = Column(Integer, primary_key=True, index=True)

    # Keep UUID as TEXT for easy transport in JSON/SSE.
    uuid = Column(
        String,
        nullable=False,
        unique=True,
        index=True,
        default=lambda: uuid4().hex,
        server_default=text("gen_random_uuid()::text"),
    )

    # IMPORTANT: runs.id is a STRING (e.g. "run_<hex>") per migration/spec.
    run_id = Column(
        String,
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Monotonic sequence number per run (strictly increasing, 1-based).
    # Used by SSE clients for reconnect via Last-Event-ID / ?cursor=seq.
    seq = Column(Integer, nullable=False)

    # token | log | tool_call | tool_result | system | error | done | cancelled | heartbeat
    type = Column(String, nullable=False)

    # Payload is nullable in the initial migration (001). Keep nullable=True for
    # backwards compatibility with existing DBs, but the app will always write
    # a dict payload.
    payload = Column(JSON, nullable=True)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


def append_run_event(
    db: Session,
    *,
    run_id: str,
    type: str,
    payload: Optional[Dict[str, Any]] = None,
) -> RunEvent:
    """Create a RunEvent with an atomically assigned per-run seq.

    Uses SELECT ... FOR UPDATE on PostgreSQL to serialize seq assignment
    within a run, guaranteeing strict monotonic ordering even under
    concurrent writers.  Falls back to plain SELECT on SQLite (tests).
    """
    # Compute next seq for this run (1-based)
    q = (
        db.query(func.coalesce(func.max(RunEvent.seq), 0))
        .filter(RunEvent.run_id == run_id)
    )
    # SQLite does not support FOR UPDATE; skip it in that case.
    bind_url = str(db.get_bind().url) if db.get_bind() else ""
    if "sqlite" not in bind_url:
        q = q.with_for_update()
    row = q.one()
    next_seq = row[0] + 1

    event = RunEvent(
        run_id=run_id,
        seq=next_seq,
        type=type,
        payload=payload or {},
    )
    db.add(event)
    db.flush()  # assign id without committing -- caller controls commit
    return event
