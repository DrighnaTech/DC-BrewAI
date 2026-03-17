import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FineTuneJob(Base):
    __tablename__ = "finetune_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "running", "completed", "failed", name="finetune_status"),
        default="pending",
        nullable=False,
        index=True,
    )
    dataset_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    export_format: Mapped[str] = mapped_column(String(50), default="alpaca", nullable=False)
    log_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    triggered_by_user: Mapped["User | None"] = relationship("User")
