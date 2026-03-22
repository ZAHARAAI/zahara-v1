"""Add monotonic seq column to run_events for SSE reconnect/replay.

Every run_event gets a per-run sequence number (strictly increasing).
This enables clients to reconnect with Last-Event-ID=seq and replay
only the events they missed.

Additive migration only -- no columns dropped, no tables removed.

Revision ID: 007
Revises: 006
Create Date: 2026-03-07
"""

import sqlalchemy as sa
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add nullable seq column first
    op.add_column(
        "run_events",
        sa.Column("seq", sa.Integer(), nullable=True),
    )

    # 2. Backfill existing rows: assign seq per run ordered by id
    op.execute(
        sa.text(
            """
            UPDATE run_events
            SET seq = sub.rn
            FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY id) AS rn
                FROM run_events
            ) sub
            WHERE run_events.id = sub.id
            """
        )
    )

    # 3. Make seq NOT NULL now that all rows have a value
    op.alter_column("run_events", "seq", nullable=False)

    # 4. Unique constraint: (run_id, seq) ensures monotonic per run
    op.create_unique_constraint(
        "uq_run_events_run_id_seq",
        "run_events",
        ["run_id", "seq"],
    )

    # 5. Index for fast cursor-based queries: WHERE run_id = ? AND seq > ?
    op.create_index(
        "ix_run_events_run_id_seq",
        "run_events",
        ["run_id", "seq"],
    )


def downgrade():
    op.drop_index("ix_run_events_run_id_seq", table_name="run_events")
    op.drop_constraint("uq_run_events_run_id_seq", "run_events", type_="unique")
    op.drop_column("run_events", "seq")
