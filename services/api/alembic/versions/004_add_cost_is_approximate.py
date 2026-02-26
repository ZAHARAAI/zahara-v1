"""add cost_is_approximate to runs

Revision ID: 004
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
    # NOTE: server_default is intentionally kept so that raw SQL inserts
    # (e.g. seed scripts, direct psql) never hit a NOT NULL violation.
    # The ORM model also sets default=False at the Python level.


def downgrade() -> None:
    op.drop_column("runs", "cost_is_approximate")
