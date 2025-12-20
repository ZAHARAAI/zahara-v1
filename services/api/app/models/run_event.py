from __future__ import annotations

from uuid import uuid4

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, func, text

from ..database import Base


class RunEvent(Base):
    __tablename__ = "run_events"

    id = Column(Integer, primary_key=True, index=True)

    # Keep UUID as TEXT for easy transport in JSON/SSE.
    # We set BOTH:
    # - a Python default (works even if DB default isn't available)
    # - a Postgres server_default (matches the Alembic migration)
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

    # token | log | tool_call | tool_result | system | error | done | ping
    type = Column(String, nullable=False)

    # Payload is nullable in the initial migration (001). Keep nullable=True for
    # backwards compatibility with existing DBs, but the app will always write
    # a dict payload.
    payload = Column(JSON, nullable=True)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
