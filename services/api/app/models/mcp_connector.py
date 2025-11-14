from sqlalchemy import JSON, Boolean, Column, DateTime, String

from ..database import Base


class MCPConnector(Base):
    __tablename__ = "mcp_connectors"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    meta = Column(JSON, nullable=True)

    last_test_status = Column(String, nullable=True)
    last_test_at = Column(DateTime(timezone=True), nullable=True)
