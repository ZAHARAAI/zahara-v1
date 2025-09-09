"""Add traces, spans, events tables for Agent Clinic

Revision ID: 002_add_traces_spans_events
Revises: 001_initial_migration
Create Date: 2024-09-06 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002_add_traces_spans_events"
down_revision: Union[str, None] = "001_initial_migration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create traces table
    op.create_table(
        "traces",
        sa.Column("trace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("total_duration", sa.Float(), nullable=False, default=0.0),
        sa.Column("total_tokens", sa.Integer(), nullable=False, default=0),
        sa.Column("total_cost", sa.Numeric(10, 4), nullable=False, default=0.0),
        sa.Column("status", sa.String(), nullable=False, default="OK"),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("workflow_id", sa.String(), nullable=True),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("operation", sa.String(), nullable=False),
        sa.Column("request_id", sa.String(), nullable=True),
        sa.Column("client_ip", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column(
            "trace_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.PrimaryKeyConstraint("trace_id"),
    )

    # Create indexes for traces table
    op.create_index("idx_traces_timestamp", "traces", ["timestamp"])
    op.create_index("idx_traces_status", "traces", ["status"])
    op.create_index("idx_traces_model", "traces", ["model"])
    op.create_index("idx_traces_operation", "traces", ["operation"])
    op.create_index("idx_traces_user_id", "traces", ["user_id"])
    op.create_index("idx_traces_workflow_id", "traces", ["workflow_id"])

    # Create spans table
    op.create_table(
        "spans",
        sa.Column("span_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, default="OK"),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("tokens", sa.Integer(), nullable=False, default=0),
        sa.Column("cost", sa.Numeric(10, 4), nullable=False, default=0.0),
        sa.Column("operation", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column(
            "span_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["trace_id"],
            ["traces.trace_id"],
        ),
        sa.PrimaryKeyConstraint("span_id"),
    )

    # Create indexes for spans table
    op.create_index("idx_spans_trace_id", "spans", ["trace_id"])
    op.create_index("idx_spans_start_time", "spans", ["start_time"])
    op.create_index("idx_spans_model", "spans", ["model"])
    op.create_index("idx_spans_provider", "spans", ["provider"])
    op.create_index("idx_spans_status", "spans", ["status"])

    # Create trace_events table
    op.create_table(
        "trace_events",
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("span_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("level", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "event_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["span_id"],
            ["spans.span_id"],
        ),
        sa.ForeignKeyConstraint(
            ["trace_id"],
            ["traces.trace_id"],
        ),
        sa.PrimaryKeyConstraint("event_id"),
    )

    # Create indexes for trace_events table
    op.create_index("idx_events_trace_id", "trace_events", ["trace_id"])
    op.create_index("idx_events_span_id", "trace_events", ["span_id"])
    op.create_index("idx_events_timestamp", "trace_events", ["timestamp"])
    op.create_index("idx_events_level", "trace_events", ["level"])

    # Create flowise_executions table
    op.create_table(
        "flowise_executions",
        sa.Column("execution_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_id", sa.String(), nullable=False),
        sa.Column("trace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("status", sa.String(), nullable=False, default="OK"),
        sa.Column(
            "flowise_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["trace_id"],
            ["traces.trace_id"],
        ),
        sa.PrimaryKeyConstraint("execution_id"),
    )

    # Create indexes for flowise_executions table
    op.create_index("idx_flowise_workflow_id", "flowise_executions", ["workflow_id"])
    op.create_index("idx_flowise_trace_id", "flowise_executions", ["trace_id"])
    op.create_index("idx_flowise_timestamp", "flowise_executions", ["timestamp"])


def downgrade() -> None:
    # Drop flowise_executions table and indexes
    op.drop_index("idx_flowise_timestamp", table_name="flowise_executions")
    op.drop_index("idx_flowise_trace_id", table_name="flowise_executions")
    op.drop_index("idx_flowise_workflow_id", table_name="flowise_executions")
    op.drop_table("flowise_executions")

    # Drop trace_events table and indexes
    op.drop_index("idx_events_level", table_name="trace_events")
    op.drop_index("idx_events_timestamp", table_name="trace_events")
    op.drop_index("idx_events_span_id", table_name="trace_events")
    op.drop_index("idx_events_trace_id", table_name="trace_events")
    op.drop_table("trace_events")

    # Drop spans table and indexes
    op.drop_index("idx_spans_status", table_name="spans")
    op.drop_index("idx_spans_provider", table_name="spans")
    op.drop_index("idx_spans_model", table_name="spans")
    op.drop_index("idx_spans_start_time", table_name="spans")
    op.drop_index("idx_spans_trace_id", table_name="spans")
    op.drop_table("spans")

    # Drop traces table and indexes
    op.drop_index("idx_traces_workflow_id", table_name="traces")
    op.drop_index("idx_traces_user_id", table_name="traces")
    op.drop_index("idx_traces_operation", table_name="traces")
    op.drop_index("idx_traces_model", table_name="traces")
    op.drop_index("idx_traces_status", table_name="traces")
    op.drop_index("idx_traces_timestamp", table_name="traces")
    op.drop_table("traces")
