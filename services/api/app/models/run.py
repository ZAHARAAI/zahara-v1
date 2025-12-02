from sqlalchemy import (
    JSON,
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
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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
    error_message = Column(Text, nullable=True)

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
