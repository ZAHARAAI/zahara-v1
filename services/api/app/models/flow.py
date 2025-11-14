from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB

from ..database import Base


class Flow(Base):
    __tablename__ = "flows"

    id = Column(String, primary_key=True, index=True)  # use uuid4 as string
    name = Column(String, nullable=False)
    # Store your React Flow graph here: { nodes: [...], edges: [...] }
    graph = Column(JSONB, nullable=False)

    owner_id = Column(String, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
