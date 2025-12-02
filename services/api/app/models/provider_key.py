from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from ..database import Base


class ProviderKey(Base):
    __tablename__ = "provider_keys"

    id = Column(String, primary_key=True, index=True)  # UUID as string
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    provider = Column(String, nullable=False)  # e.g. "openai", "anthropic"
    label = Column(String, nullable=False)
    encrypted_key = Column(Text, nullable=False)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_tested_at = Column(DateTime(timezone=True), nullable=True)
    last_test_status = Column(String, nullable=True)  # "success" | "error" | "never"
