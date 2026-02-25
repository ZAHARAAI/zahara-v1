from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)

from ..database import Base


class Run(Base):
    __tablename__ = "runs"

    # Identity & ownership
    id = Column(String, primary_key=True, index=True)  # run_id (UUID as string)
    agent_id = Column(
        String,
        ForeignKey("agents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Track the exact AgentSpec version used for this run.
    # This enables deterministic retries/replays.
    agent_spec_id = Column(
        String,
        ForeignKey("agent_specs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Lineage: if this run is a retry of a previous run
    retry_of_run_id = Column(
        String,
        ForeignKey("runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Correlation & status
    request_id = Column(String, index=True, nullable=True)
    status = Column(
        String, default="pending", nullable=False, index=True
    )  # pending | running | success | error

    # Model + routing
    model = Column(String, nullable=True)
    provider = Column(String, nullable=True)
    source = Column(String, nullable=True)  # vibe | pro | flow | agui | api

    # Metrics
    latency_ms = Column(Integer, nullable=True)
    tokens_in = Column(Integer, nullable=True)
    tokens_out = Column(Integer, nullable=True)
    tokens_total = Column(Integer, nullable=True)
    cost_estimate_usd = Column(Float, nullable=True)
    cost_is_approximate = Column(Boolean, nullable=False, server_default="false")
    error_message = Column(Text, nullable=True)

    # Persist the user's primary input for auditing/replay.
    # This is intentionally separate from `config` so the Clinic can render a
    # quick preview without parsing nested config.
    input = Column(Text, nullable=True)

    # Optional full config used to launch the run
    config = Column(JSON, nullable=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
