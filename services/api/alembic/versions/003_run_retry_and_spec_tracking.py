"""Run: spec tracking + retry lineage

Revision ID: 003
Revises: 002
Create Date: 2026-02-22
"""

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    # Track which AgentSpec version was used for a run
    op.add_column(
        "runs",
        sa.Column(
            "agent_spec_id",
            sa.String(),
            sa.ForeignKey("agent_specs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_runs_agent_spec_id", "runs", ["agent_spec_id"])

    # Retry lineage
    op.add_column(
        "runs",
        sa.Column(
            "retry_of_run_id",
            sa.String(),
            sa.ForeignKey("runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_runs_retry_of_run_id", "runs", ["retry_of_run_id"])


def downgrade():
    op.drop_index("ix_runs_retry_of_run_id", table_name="runs")
    op.drop_column("runs", "retry_of_run_id")

    op.drop_index("ix_runs_agent_spec_id", table_name="runs")
    op.drop_column("runs", "agent_spec_id")
