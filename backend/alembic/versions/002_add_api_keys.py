"""Add API keys table

Revision ID: 002
Revises: 001
Create Date: 2025-06-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("key_prefix", sa.String(12), nullable=False),
        sa.Column("scopes", sa.Text, nullable=False, server_default="general,coder,ocr"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("rate_limit", sa.Integer, nullable=False, server_default="60"),
        sa.Column("total_requests", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])


def downgrade() -> None:
    op.drop_table("api_keys")
