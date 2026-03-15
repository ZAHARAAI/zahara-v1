from __future__ import annotations

from uuid import uuid4

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, func, text

from ..database import Base


class RunEvent(Base):
    __tablename__ = "run_events"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(
        String,
        nullable=False,
        unique=True,
        index=True,
        default=lambda: uuid4().hex,
        server_default=text("gen_random_uuid()::text"),
    )

    run_id = Column(
        String,
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # token | log | tool_call | tool_result | system | error | done | ping
    type = Column(String, nullable=False)

    payload = Column(JSON, nullable=True)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    seq = Column(Integer, nullable=False, default=0)
