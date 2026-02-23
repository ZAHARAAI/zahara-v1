"""add cost_is_approximate to runs

Revision ID: 004_add_cost_is_approximate
Revises: 003
Create Date: 2026-02-23 15:08:29

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "runs",
        sa.Column(
            "cost_is_approximate",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Drop server default to keep schema clean
    op.alter_column("runs", "cost_is_approximate", server_default=None)


def downgrade() -> None:
    op.drop_column("runs", "cost_is_approximate")
