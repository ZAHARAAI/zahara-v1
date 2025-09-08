import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    TypeDecorator,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

Base = declarative_base()


# Database-agnostic UUID type
class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type, otherwise uses String(36).
    """

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return value
        else:
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return value
        else:
            return uuid.UUID(value) if isinstance(value, str) else value


# Database-agnostic JSON type
class JSON(TypeDecorator):
    """Platform-independent JSON type.
    Uses PostgreSQL's JSONB type, otherwise uses Text.
    """

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        else:
            return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return value
        else:
            import json

            return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return value
        else:
            import json

            return json.loads(value) if isinstance(value, str) else value


class Trace(Base):
    __tablename__ = "traces"

    # Primary fields
    trace_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    timestamp = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    total_duration = Column(Float, nullable=False, default=0.0)  # in milliseconds
    total_tokens = Column(Integer, nullable=False, default=0)
    total_cost = Column(Numeric(10, 4), nullable=False, default=0.0)
    status = Column(String, nullable=False, default="OK")  # OK, ERROR, RATE-LIMIT

    # Optional fields
    user_id = Column(String, nullable=True)
    workflow_id = Column(String, nullable=True)
    model = Column(String, nullable=False)
    operation = Column(String, nullable=False)

    # Metadata
    request_id = Column(String, nullable=True)  # From observability middleware
    client_ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    trace_metadata = Column(JSON(), nullable=True)

    # Relationships
    spans = relationship("Span", back_populates="trace", cascade="all, delete-orphan")
    events = relationship(
        "TraceEvent", back_populates="trace", cascade="all, delete-orphan"
    )
    flowise_executions = relationship(
        "FlowiseExecution", back_populates="trace", cascade="all, delete-orphan"
    )

    # Indexes for performance
    __table_args__ = (
        Index("idx_traces_timestamp", "timestamp"),
        Index("idx_traces_status", "status"),
        Index("idx_traces_model", "model"),
        Index("idx_traces_operation", "operation"),
        Index("idx_traces_user_id", "user_id"),
        Index("idx_traces_workflow_id", "workflow_id"),
    )

    def to_dict(self):
        return {
            "trace_id": self.trace_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "total_duration": self.total_duration,
            "total_tokens": self.total_tokens,
            "total_cost": self.total_cost,
            "status": self.status,
            "user_id": self.user_id,
            "workflow_id": self.workflow_id,
            "model": self.model,
            "operation": self.operation,
            "request_id": self.request_id,
            "metadata": self.trace_metadata,
            "spans": [span.to_dict() for span in self.spans] if self.spans else [],
            "events": [event.to_dict() for event in self.events] if self.events else [],
        }


class Span(Base):
    __tablename__ = "spans"

    # Primary fields
    span_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    trace_id = Column(GUID(), ForeignKey("traces.trace_id"), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    duration = Column(Float, nullable=False)  # in milliseconds
    status = Column(String, nullable=False, default="OK")  # OK, ERROR, RATE-LIMIT

    # LLM-specific fields
    model = Column(String, nullable=False)
    tokens = Column(Integer, nullable=False, default=0)
    cost = Column(Numeric(10, 4), nullable=False, default=0.0)
    operation = Column(String, nullable=False)
    provider = Column(String, nullable=False)

    # Metadata
    span_metadata = Column(JSON(), nullable=True)

    # Relationships
    trace = relationship("Trace", back_populates="spans")
    events = relationship(
        "TraceEvent", back_populates="span", cascade="all, delete-orphan"
    )

    # Indexes
    __table_args__ = (
        Index("idx_spans_trace_id", "trace_id"),
        Index("idx_spans_start_time", "start_time"),
        Index("idx_spans_model", "model"),
        Index("idx_spans_provider", "provider"),
        Index("idx_spans_status", "status"),
    )

    def to_dict(self):
        return {
            "span_id": self.span_id,
            "trace_id": self.trace_id,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration": self.duration,
            "status": self.status,
            "model": self.model,
            "tokens": self.tokens,
            "cost": self.cost,
            "operation": self.operation,
            "provider": self.provider,
            "metadata": self.span_metadata,
        }


class TraceEvent(Base):
    __tablename__ = "trace_events"

    # Primary fields
    event_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    trace_id = Column(GUID(), ForeignKey("traces.trace_id"), nullable=False)
    span_id = Column(GUID(), ForeignKey("spans.span_id"), nullable=True)
    timestamp = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    level = Column(String, nullable=False)  # info, warning, error
    message = Column(Text, nullable=False)

    # Metadata
    event_metadata = Column(JSON(), nullable=True)

    # Relationships
    trace = relationship("Trace", back_populates="events")
    span = relationship("Span", back_populates="events")

    # Indexes
    __table_args__ = (
        Index("idx_events_trace_id", "trace_id"),
        Index("idx_events_span_id", "span_id"),
        Index("idx_events_timestamp", "timestamp"),
        Index("idx_events_level", "level"),
    )

    def to_dict(self):
        return {
            "event_id": self.event_id,
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "level": self.level,
            "message": self.message,
            "metadata": self.event_metadata,
        }


class FlowiseExecution(Base):
    __tablename__ = "flowise_executions"

    # Primary fields
    execution_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(String, nullable=False)
    trace_id = Column(GUID(), ForeignKey("traces.trace_id"), nullable=False)
    timestamp = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    status = Column(String, nullable=False, default="OK")

    # Flowise-specific data
    flowise_data = Column(
        JSON(), nullable=True
    )  # Store LangChain Run data, token usage, etc.

    # Relationships
    trace = relationship("Trace", back_populates="flowise_executions")

    # Indexes
    __table_args__ = (
        Index("idx_flowise_workflow_id", "workflow_id"),
        Index("idx_flowise_trace_id", "trace_id"),
        Index("idx_flowise_timestamp", "timestamp"),
    )

    def to_dict(self):
        return {
            "execution_id": self.execution_id,
            "workflow_id": self.workflow_id,
            "trace_id": self.trace_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "status": self.status,
            "flowise_data": self.flowise_data,
        }
