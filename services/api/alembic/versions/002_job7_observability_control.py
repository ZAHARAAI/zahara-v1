"""Job7: observability + control layer (agents lifecycle, audit_log, run indexes)

Revision ID: 002
Revises:
Create Date: 2026-02-18
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # --- agents: lifecycle + budget ---
    op.add_column(
        "agents",
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="active"
        ),
    )
    op.add_column(
        "agents",
        sa.Column("budget_daily_usd", sa.Numeric(10, 2), nullable=True),
    )

    op.create_check_constraint(
        "ck_agents_budget_daily_usd_non_negative",
        "agents",
        "budget_daily_usd IS NULL OR budget_daily_usd >= 0",
    )

    # --- audit_log table ---
    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(), primary_key=True),  # UUID stored as string
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=True),
        sa.Column(
            "entity_id", sa.String(), nullable=True
        ),  # UUID string of agent/run/key/etc
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_audit_log_user_created_at",
        "audit_log",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_audit_log_user_event_type",
        "audit_log",
        ["user_id", "event_type"],
    )
    op.create_index(
        "ix_audit_log_user_entity",
        "audit_log",
        ["user_id", "entity_type", "entity_id"],
    )

    # --- runs indexes (Job7 required) ---
    op.create_index(
        "ix_runs_user_agent_created_at",
        "runs",
        ["user_id", "agent_id", "created_at"],
    )
    op.create_index(
        "ix_runs_user_status_created_at",
        "runs",
        ["user_id", "status", "created_at"],
    )


def downgrade():
    # runs indexes
    op.drop_index("ix_runs_user_status_created_at", table_name="runs")
    op.drop_index("ix_runs_user_agent_created_at", table_name="runs")

    # audit_log
    op.drop_index("ix_audit_log_user_entity", table_name="audit_log")
    op.drop_index("ix_audit_log_user_event_type", table_name="audit_log")
    op.drop_index("ix_audit_log_user_created_at", table_name="audit_log")
    op.drop_table("audit_log")

    # agents constraint + columns
    op.drop_constraint(
        "ck_agents_budget_daily_usd_non_negative",
        "agents",
        type_="check",
    )
    op.drop_column("agents", "budget_daily_usd")
    op.drop_column("agents", "status")
