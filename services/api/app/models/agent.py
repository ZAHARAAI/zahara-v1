from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)

from ..database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, index=True)  # store UUID as string
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(
        String(16), nullable=False, default="active", server_default="active"
    )
    budget_daily_usd = Column(Numeric(10, 2), nullable=True)
    tool_allowlist = Column(JSON, nullable=True)  # deny-by-default: None blocks unless TOOL_GOVERNANCE_LEGACY_OPEN=true
    max_steps_per_run = Column(Integer, nullable=True)  # max steps per run, None = unlimited
    max_duration_seconds_per_run = Column(Integer, nullable=True)  # max duration per run, None = unlimited

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "slug", name="uq_agents_user_id_slug"),
    )
