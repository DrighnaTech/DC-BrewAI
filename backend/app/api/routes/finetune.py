import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core import metrics
from app.core.config import settings
from app.db.base import get_db
from app.db.models.feedback import Feedback
from app.db.models.finetune_job import FineTuneJob
from app.db.models.user import User
from app.services.dataset_exporter import export
from app.services.finetune_trigger import trigger_finetune

router = APIRouter()


class TriggerRequest(BaseModel):
    export_format: str = "alpaca"  # alpaca | chatml


class JobResponse(BaseModel):
    id: str
    status: str
    dataset_size: int | None
    export_format: str
    log_output: str | None
    started_at: str | None
    completed_at: str | None
    created_at: str


class ReadinessResponse(BaseModel):
    approved_count: int
    min_required: int
    ready: bool


@router.get("/readiness", response_model=ReadinessResponse)
async def check_readiness(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count = (
        await db.execute(
            select(func.count()).select_from(Feedback).where(Feedback.approved_for_training == True)  # noqa: E712
        )
    ).scalar_one()
    return ReadinessResponse(
        approved_count=count,
        min_required=settings.MIN_TRAINING_EXAMPLES,
        ready=count >= settings.MIN_TRAINING_EXAMPLES,
    )


@router.post("/trigger", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_job(
    req: TriggerRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Export JSONL
    jsonl, count = await export(db, fmt=req.export_format)
    if count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No approved training examples found. Approve examples in the Dataset page first.")

    # Create job record
    job = FineTuneJob(
        triggered_by=admin.id,
        status="running",
        dataset_size=count,
        export_format=req.export_format,
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Fire trigger (non-blocking — job status updated by GPU server callback or manually)
    try:
        gpu_response = await trigger_finetune(jsonl, req.export_format, count)
        job.log_output = f"Triggered: {gpu_response}"
        metrics.finetune_jobs_total.labels(status="triggered").inc()
    except Exception as e:
        job.status = "failed"
        job.log_output = str(e)
        job.completed_at = datetime.now(timezone.utc)
        metrics.finetune_jobs_total.labels(status="failed").inc()

    await db.commit()
    await db.refresh(job)

    return _job_to_response(job)


@router.get("/jobs", response_model=list[JobResponse])
async def list_jobs(
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FineTuneJob).order_by(FineTuneJob.created_at.desc()).limit(limit))
    return [_job_to_response(j) for j in result.scalars().all()]


@router.patch("/jobs/{job_id}/complete", response_model=JobResponse)
async def mark_complete(
    job_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """GPU server or admin manually marks job as completed."""
    result = await db.execute(select(FineTuneJob).where(FineTuneJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    job.status = "completed"
    job.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(job)
    metrics.finetune_jobs_total.labels(status="completed").inc()
    return _job_to_response(job)


def _job_to_response(job: FineTuneJob) -> JobResponse:
    return JobResponse(
        id=str(job.id),
        status=job.status,
        dataset_size=job.dataset_size,
        export_format=job.export_format,
        log_output=job.log_output,
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        created_at=job.created_at.isoformat(),
    )
