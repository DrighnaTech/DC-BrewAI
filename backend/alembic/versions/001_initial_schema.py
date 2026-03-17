"""Initial schema

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Define enums with create_type=False so SQLAlchemy does NOT auto-emit CREATE TYPE.
# We create them manually first via op.execute, giving us full control.
user_role_enum = postgresql.ENUM("admin", "user", name="user_role", create_type=False)
finetune_status_enum = postgresql.ENUM(
    "pending", "running", "completed", "failed",
    name="finetune_status", create_type=False,
)


def upgrade() -> None:
    # Create enum types explicitly (safe — DO block swallows duplicate errors)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE user_role AS ENUM ('admin', 'user');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE finetune_status AS ENUM ('pending', 'running', 'completed', 'failed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("role", user_role_enum, nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False, server_default="New Chat"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])

    op.create_table(
        "runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("system_prompt", sa.Text, nullable=True),
        sa.Column("response", sa.Text, nullable=False),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("tokens_in", sa.Integer, nullable=True),
        sa.Column("tokens_out", sa.Integer, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_runs_session_id", "runs", ["session_id"])
    op.create_index("ix_runs_user_id", "runs", ["user_id"])
    op.create_index("ix_runs_created_at", "runs", ["created_at"])

    op.create_table(
        "feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rating", sa.SmallInteger, nullable=False),
        sa.Column("correction", sa.Text, nullable=True),
        sa.Column("approved_for_training", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_feedback_run_id", "feedback", ["run_id"])
    op.create_index("ix_feedback_approved", "feedback", ["approved_for_training"])

    op.create_table(
        "model_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("ollama_model_id", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_model_versions_is_active", "model_versions", ["is_active"])

    op.create_table(
        "finetune_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", finetune_status_enum, nullable=False, server_default="pending"),
        sa.Column("dataset_size", sa.Integer, nullable=True),
        sa.Column("export_format", sa.String(50), nullable=False, server_default="alpaca"),
        sa.Column("log_output", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_finetune_jobs_status", "finetune_jobs", ["status"])


def downgrade() -> None:
    op.drop_table("finetune_jobs")
    op.drop_table("model_versions")
    op.drop_table("feedback")
    op.drop_table("runs")
    op.drop_table("chat_sessions")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS finetune_status")
    op.execute("DROP TYPE IF EXISTS user_role")
