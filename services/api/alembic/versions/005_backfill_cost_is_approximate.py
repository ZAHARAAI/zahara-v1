"""backfill cost_is_approximate for existing runs

Revision ID: 005
Revises: 004
Create Date: 2026-02-23 00:00:00

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Mark runs with missing stored cost as approximate (best-effort historical backfill)
    op.execute(
        """
        UPDATE runs
        SET cost_is_approximate = TRUE
        WHERE cost_estimate_usd IS NULL
          AND (cost_is_approximate IS NULL OR cost_is_approximate = FALSE)
          AND COALESCE(tokens_total, 0) > 0
        """
    )

    # For runs that have a stored cost but NULL flag, set flag to FALSE
    op.execute(
        """
        UPDATE runs
        SET cost_is_approximate = FALSE
        WHERE cost_estimate_usd IS NOT NULL
          AND cost_is_approximate IS NULL
        """
    )

    # For runs that have neither cost nor tokens, ensure flag is FALSE (unknown-but-not-estimated)
    op.execute(
        """
        UPDATE runs
        SET cost_is_approximate = FALSE
        WHERE cost_estimate_usd IS NULL
          AND COALESCE(tokens_total, 0) = 0
          AND cost_is_approximate IS NULL
        """
    )


def downgrade() -> None:
    # Downgrade keeps the column (added in previous revision) but reverts backfill values.
    # We set the flag to NULL to restore pre-backfill state.
    op.execute(
        """
        UPDATE runs
        SET cost_is_approximate = NULL
        """
    )
