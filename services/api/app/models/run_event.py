from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, func

from ..database import Base


class RunEvent(Base):
    __tablename__ = "run_events"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String, ForeignKey("runs.id"), index=True)
    ts = Column(DateTime(timezone=True), server_default=func.now())
    # token | log | tool_call | tool_result | system | error | done
    type = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
