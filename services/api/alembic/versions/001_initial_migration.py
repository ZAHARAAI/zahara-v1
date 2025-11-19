"""Initial migration: users, api_keys, flows, runs, run_events, mcp_connectors

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

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
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("description", sa.Text(), nullable=True),
        # Permissions
        sa.Column(
            "can_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "can_write",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "can_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        # Usage tracking
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "request_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        # Timestamps
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
    op.create_index(
        op.f("ix_api_keys_key_hash"),
        "api_keys",
        ["key_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_api_keys_key_prefix"),
        "api_keys",
        ["key_prefix"],
        unique=False,
    )

    # --- flows ---------------------------------------------------
    op.create_table(
        "flows",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "graph",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        # NOTE: model uses ForeignKey("users.id") with String type,
        # but users.id is Integer; for now we store plain String without FK.
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

    # --- runs ----------------------------------------------------
    op.create_table(
        "runs",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("request_id", sa.String(), nullable=True),
        sa.Column(
            "status",
            sa.String(),
            nullable=True,
            server_default=sa.text("'running'"),
        ),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
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
    )
    op.create_index(op.f("ix_runs_id"), "runs", ["id"], unique=False)
    op.create_index(
        op.f("ix_runs_request_id"),
        "runs",
        ["request_id"],
        unique=False,
    )

    # --- run_events ----------------------------------------------
    op.create_table(
        "run_events",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("run_id", sa.String(), nullable=False),
        sa.Column(
            "ts",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
    )
    op.create_index(op.f("ix_run_events_id"), "run_events", ["id"], unique=False)
    op.create_index(
        op.f("ix_run_events_run_id"),
        "run_events",
        ["run_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_run_events_run_id_runs",
        source_table="run_events",
        referent_table="runs",
        local_cols=["run_id"],
        remote_cols=["id"],
    )

    # --- mcp_connectors ------------------------------------------
    op.create_table(
        "mcp_connectors",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("last_test_status", sa.String(), nullable=True),
        sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_mcp_connectors_id"),
        "mcp_connectors",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_mcp_connectors_name"),
        "mcp_connectors",
        ["name"],
        unique=False,
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index(
        op.f("ix_mcp_connectors_name"),
        table_name="mcp_connectors",
    )
    op.drop_index(
        op.f("ix_mcp_connectors_id"),
        table_name="mcp_connectors",
    )
    op.drop_table("mcp_connectors")

    op.drop_constraint(
        "fk_run_events_run_id_runs",
        "run_events",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_run_events_run_id"),
        table_name="run_events",
    )
    op.drop_index(op.f("ix_run_events_id"), table_name="run_events")
    op.drop_table("run_events")

    op.drop_index(op.f("ix_runs_request_id"), table_name="runs")
    op.drop_index(op.f("ix_runs_id"), table_name="runs")
    op.drop_table("runs")

    op.drop_index(op.f("ix_flows_name"), table_name="flows")
    op.drop_index(op.f("ix_flows_id"), table_name="flows")
    op.drop_table("flows")

    op.drop_index(
        op.f("ix_api_keys_key_prefix"),
        table_name="api_keys",
    )
    op.drop_index(
        op.f("ix_api_keys_key_hash"),
        table_name="api_keys",
    )
    op.drop_index(op.f("ix_api_keys_name"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_id"), table_name="api_keys")
    op.drop_table("api_keys")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")
