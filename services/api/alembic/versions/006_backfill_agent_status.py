"""Backfill NULL agent status to 'active'

Agents created before migration 002 added the status column may have
NULL in that field if the server_default was not applied retroactively
(e.g. test fixtures, manually seeded rows, or certain DB engines).
This migration ensures every existing agent row has a non-null status.

Revision ID: 006
Revises: 005
Create Date: 2026-02-26
"""

import sqlalchemy as sa
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade():
    # Backfill any agent rows where status is NULL → set to 'active'
    op.execute(sa.text("UPDATE agents SET status = 'active' WHERE status IS NULL"))


def downgrade():
    # No meaningful rollback — we cannot know which rows were originally NULL
    pass
