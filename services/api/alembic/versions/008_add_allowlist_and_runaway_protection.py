"""Add tools allowlist and runaway protection fields to agents

Revision ID: 008
Revises: 007
Create Date: 2026-02-26
"""

import sqlalchemy as sa
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    # Add tool_allowlist column (JSON, nullable) for tool allowlist enforcement
    op.add_column("agents", sa.Column("tool_allowlist", sa.JSON(), nullable=True))

    # Add max_steps_per_run column (Integer, nullable) for runaway protection
    op.add_column(
        "agents", sa.Column("max_steps_per_run", sa.Integer(), nullable=True)
    )

    # Add max_duration_seconds_per_run column (Integer, nullable) for runaway protection
    op.add_column(
        "agents",
        sa.Column("max_duration_seconds_per_run", sa.Integer(), nullable=True),
    )


def downgrade():
    op.drop_column("agents", "max_duration_seconds_per_run")
    op.drop_column("agents", "max_steps_per_run")
    op.drop_column("agents", "tool_allowlist")
