from sqlalchemy import Column, DateTime, Float, Integer, String, func

from ..database import Base


class Run(Base):
    __tablename__ = "runs"

    id = Column(String, primary_key=True, index=True)  # run_id
    request_id = Column(String, index=True)
    status = Column(String, default="running")
    model = Column(String, nullable=True)
    source = Column(String, nullable=True)

    tokens = Column(Integer, nullable=True)
    cost = Column(Float, nullable=True)
    latency_ms = Column(Integer, nullable=True)

    started_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
