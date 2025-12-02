"""Job 6 backend schema: agents, agent_specs, runs, run_events, provider_keys.

- Adds agents / agent_specs / provider_keys tables
- Extends runs with user/agent/metrics fields
- Extends run_events with created_at
- Adds the required indexes
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Revision identifiers, used by Alembic.
revision = "002_job6_backend_schema"
down_revision = "001"  # make sure this matches your initial migration id
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- agents --------------------------------------------------------------
    op.create_table(
        "agents",
        sa.Column("id", sa.String(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "slug", name="uq_agents_user_id_slug"),
    )
    op.create_index("ix_agents_user_id", "agents", ["user_id"])
    op.create_index("ix_agents_slug", "agents", ["slug"])

    # --- agent_specs ---------------------------------------------------------
    op.create_table(
        "agent_specs",
        sa.Column("id", sa.String(), primary_key=True, index=True),
        sa.Column(
            "agent_id",
            sa.String(),
            sa.ForeignKey("agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "content",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "agent_id", "version", name="uq_agent_specs_agent_id_version"
        ),
    )
    op.create_index("ix_agent_specs_agent_id", "agent_specs", ["agent_id"])

    # --- provider_keys -------------------------------------------------------
    op.create_table(
        "provider_keys",
        sa.Column("id", sa.String(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_tested_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("last_test_status", sa.String(), nullable=True),
    )
    op.create_index("ix_provider_keys_user_id", "provider_keys", ["user_id"])
    op.create_index("ix_provider_keys_provider", "provider_keys", ["provider"])

    # --- runs: extend to match Job 6 spec ------------------------------------
    # Assumes runs table already exists from migration 001
    op.add_column("runs", sa.Column("agent_id", sa.String(), nullable=True))
    op.add_column("runs", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("runs", sa.Column("provider", sa.String(), nullable=True))
    op.add_column("runs", sa.Column("tokens_in", sa.Integer(), nullable=True))
    op.add_column("runs", sa.Column("tokens_out", sa.Integer(), nullable=True))
    op.add_column("runs", sa.Column("tokens_total", sa.Integer(), nullable=True))
    op.add_column("runs", sa.Column("cost_estimate_usd", sa.Float(), nullable=True))
    op.add_column("runs", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column(
        "runs",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column(
        "runs",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # FKs from runs to agents / users
    op.create_foreign_key(
        "fk_runs_agent_id_agents",
        "runs",
        "agents",
        ["agent_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_runs_user_id_users",
        "runs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Indexes on runs(agent_id), runs(user_id), runs(created_at)
    op.create_index("ix_runs_agent_id", "runs", ["agent_id"])
    op.create_index("ix_runs_user_id", "runs", ["user_id"])
    op.create_index("ix_runs_created_at", "runs", ["created_at"])

    # --- run_events: add created_at + index ----------------------------------
    # Assumes run_events table already exists with (id, run_id, ts, type, payload)
    op.add_column(
        "run_events",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_run_events_run_id_created_at",
        "run_events",
        ["run_id", "created_at"],
    )


def downgrade() -> None:
    # Drop run_events index/column
    op.drop_index("ix_run_events_run_id_created_at", table_name="run_events")
    op.drop_column("run_events", "created_at")

    # Drop runs indexes/FKs/columns
    op.drop_index("ix_runs_created_at", table_name="runs")
    op.drop_index("ix_runs_user_id", table_name="runs")
    op.drop_index("ix_runs_agent_id", table_name="runs")

    op.drop_constraint("fk_runs_user_id_users", "runs", type_="foreignkey")
    op.drop_constraint("fk_runs_agent_id_agents", "runs", type_="foreignkey")

    op.drop_column("runs", "updated_at")
    op.drop_column("runs", "created_at")
    op.drop_column("runs", "error_message")
    op.drop_column("runs", "cost_estimate_usd")
    op.drop_column("runs", "tokens_total")
    op.drop_column("runs", "tokens_out")
    op.drop_column("runs", "tokens_in")
    op.drop_column("runs", "provider")
    op.drop_column("runs", "user_id")
    op.drop_column("runs", "agent_id")

    # Drop provider_keys
    op.drop_index("ix_provider_keys_provider", table_name="provider_keys")
    op.drop_index("ix_provider_keys_user_id", table_name="provider_keys")
    op.drop_table("provider_keys")

    # Drop agent_specs
    op.drop_index("ix_agent_specs_agent_id", table_name="agent_specs")
    op.drop_table("agent_specs")

    # Drop agents
    op.drop_index("ix_agents_slug", table_name="agents")
    op.drop_index("ix_agents_user_id", table_name="agents")
    op.drop_table("agents")
