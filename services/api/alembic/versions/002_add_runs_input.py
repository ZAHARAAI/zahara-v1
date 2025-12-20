"""Add runs.input column.

Revision ID: 002_add_runs_input
Revises: 001_initial_migration
Create Date: 2025-12-21
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "002_add_runs_input"
down_revision = "001_initial_migration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Store primary user input for quick Clinic previews and replay.
    op.add_column("runs", sa.Column("input", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("runs", "input")
