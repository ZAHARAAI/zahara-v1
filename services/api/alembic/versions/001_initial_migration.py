"""Initial (squashed) migration: Job6-ready schema

Creates:
- users
- api_keys
- flows
- mcp_connectors
- agents
- agent_specs
- provider_keys
- runs
- run_events

Revision ID: 001
Revises:
Create Date: 2025-12-14 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users ---------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), nullable=True, server_default=sa.text("true")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    # --- api_keys ------------------------------------------------
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("key_hash", sa.String(length=255), nullable=False),
        sa.Column("key_prefix", sa.String(length=20), nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "can_read", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "can_write", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "can_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_api_keys_id"), "api_keys", ["id"], unique=False)
    op.create_index(op.f("ix_api_keys_name"), "api_keys", ["name"], unique=False)
    op.create_index(op.f("ix_api_keys_key_hash"), "api_keys", ["key_hash"], unique=True)
    op.create_index(
        op.f("ix_api_keys_key_prefix"), "api_keys", ["key_prefix"], unique=False
    )

    # --- flows ---------------------------------------------------
    op.create_table(
        "flows",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("graph", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        # NOTE: kept as String (no FK) to match your original migration comment
        sa.Column("owner_id", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
    )
    op.create_index(op.f("ix_flows_id"), "flows", ["id"], unique=False)
    op.create_index(op.f("ix_flows_name"), "flows", ["name"], unique=False)

    # --- mcp_connectors ------------------------------------------
    op.create_table(
        "mcp_connectors",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("last_test_status", sa.String(), nullable=True),
        sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_mcp_connectors_id"), "mcp_connectors", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_mcp_connectors_name"), "mcp_connectors", ["name"], unique=False
    )

    # --- agents --------------------------------------------------------------
    op.create_table(
        "agents",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
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
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column(
            "agent_id",
            sa.String(),
            sa.ForeignKey("agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
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
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_status", sa.String(), nullable=True),
    )
    op.create_index("ix_provider_keys_user_id", "provider_keys", ["user_id"])
    op.create_index("ix_provider_keys_provider", "provider_keys", ["provider"])

    # --- runs (Job6-ready) ---------------------------------------------------
    # Includes original fields + Job6 extensions (so no ALTER needed).
    op.create_table(
        "runs",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("request_id", sa.String(), nullable=True),
        sa.Column(
            "status", sa.String(), nullable=True, server_default=sa.text("'running'")
        ),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        # original metrics (legacy)
        sa.Column("tokens", sa.Integer(), nullable=True),
        sa.Column("cost", sa.Float(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        # Job6 additions
        sa.Column("agent_id", sa.String(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(), nullable=True),
        sa.Column("tokens_in", sa.Integer(), nullable=True),
        sa.Column("tokens_out", sa.Integer(), nullable=True),
        sa.Column("tokens_total", sa.Integer(), nullable=True),
        sa.Column("cost_estimate_usd", sa.Float(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
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
    )
    op.create_index(op.f("ix_runs_id"), "runs", ["id"], unique=False)
    op.create_index(op.f("ix_runs_request_id"), "runs", ["request_id"], unique=False)
    op.create_index("ix_runs_agent_id", "runs", ["agent_id"])
    op.create_index("ix_runs_user_id", "runs", ["user_id"])
    op.create_index("ix_runs_created_at", "runs", ["created_at"])

    op.create_foreign_key(
        "fk_runs_agent_id_agents",
        source_table="runs",
        referent_table="agents",
        local_cols=["agent_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_runs_user_id_users",
        source_table="runs",
        referent_table="users",
        local_cols=["user_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )

    # --- run_events (Job6-ready) --------------------------------------------
    op.create_table(
        "run_events",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("run_id", sa.String(), nullable=False),
        # legacy timestamp field retained
        sa.Column(
            "ts",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        # Job6 field
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_run_events_id"), "run_events", ["id"], unique=False)
    op.create_index(
        op.f("ix_run_events_run_id"), "run_events", ["run_id"], unique=False
    )
    op.create_index(
        "ix_run_events_run_id_created_at", "run_events", ["run_id", "created_at"]
    )

    op.create_foreign_key(
        "fk_run_events_run_id_runs",
        source_table="run_events",
        referent_table="runs",
        local_cols=["run_id"],
        remote_cols=["id"],
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_constraint("fk_run_events_run_id_runs", "run_events", type_="foreignkey")
    op.drop_index("ix_run_events_run_id_created_at", table_name="run_events")
    op.drop_index(op.f("ix_run_events_run_id"), table_name="run_events")
    op.drop_index(op.f("ix_run_events_id"), table_name="run_events")
    op.drop_table("run_events")

    op.drop_constraint("fk_runs_user_id_users", "runs", type_="foreignkey")
    op.drop_constraint("fk_runs_agent_id_agents", "runs", type_="foreignkey")
    op.drop_index("ix_runs_created_at", table_name="runs")
    op.drop_index("ix_runs_user_id", table_name="runs")
    op.drop_index("ix_runs_agent_id", table_name="runs")
    op.drop_index(op.f("ix_runs_request_id"), table_name="runs")
    op.drop_index(op.f("ix_runs_id"), table_name="runs")
    op.drop_table("runs")

    op.drop_index("ix_provider_keys_provider", table_name="provider_keys")
    op.drop_index("ix_provider_keys_user_id", table_name="provider_keys")
    op.drop_table("provider_keys")

    op.drop_index("ix_agent_specs_agent_id", table_name="agent_specs")
    op.drop_table("agent_specs")

    op.drop_index("ix_agents_slug", table_name="agents")
    op.drop_index("ix_agents_user_id", table_name="agents")
    op.drop_table("agents")

    op.drop_index(op.f("ix_mcp_connectors_name"), table_name="mcp_connectors")
    op.drop_index(op.f("ix_mcp_connectors_id"), table_name="mcp_connectors")
    op.drop_table("mcp_connectors")

    op.drop_index(op.f("ix_flows_name"), table_name="flows")
    op.drop_index(op.f("ix_flows_id"), table_name="flows")
    op.drop_table("flows")

    op.drop_index(op.f("ix_api_keys_key_prefix"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_key_hash"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_name"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_id"), table_name="api_keys")
    op.drop_table("api_keys")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")
