from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin
from app.db.base import get_db
from app.db.models.feedback import Feedback
from app.db.models.run import Run
from app.db.models.user import User
from app.services.dataset_exporter import export

router = APIRouter()


class FeedbackSummary(BaseModel):
    rating: int | None
    correction: str | None
    approved_for_training: bool


class RunSummary(BaseModel):
    id: str
    prompt: str
    response: str
    model_name: str
    latency_ms: int | None
    tokens_out: int | None
    created_at: str
    feedback: FeedbackSummary | None


class DatasetStats(BaseModel):
    total_runs: int
    with_feedback: int
    approved: int


@router.get("/stats", response_model=DatasetStats)
async def get_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count()).select_from(Run))).scalar_one()
    with_fb = (await db.execute(select(func.count()).select_from(Feedback))).scalar_one()
    approved = (await db.execute(select(func.count()).select_from(Feedback).where(Feedback.approved_for_training == True))).scalar_one()  # noqa: E712
    return DatasetStats(total_runs=total, with_feedback=with_fb, approved=approved)


@router.get("/runs", response_model=list[RunSummary])
async def list_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    approved_only: bool = Query(False),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Run).options(selectinload(Run.feedback)).order_by(Run.created_at.desc())
    if approved_only:
        q = q.join(Feedback, Feedback.run_id == Run.id).where(Feedback.approved_for_training == True)  # noqa: E712
    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    runs = result.scalars().all()

    output = []
    for r in runs:
        fb = r.feedback
        output.append(RunSummary(
            id=str(r.id),
            prompt=r.prompt,
            response=r.response,
            model_name=r.model_name,
            latency_ms=r.latency_ms,
            tokens_out=r.tokens_out,
            created_at=r.created_at.isoformat(),
            feedback=FeedbackSummary(
                rating=fb.rating,
                correction=fb.correction,
                approved_for_training=fb.approved_for_training,
            ) if fb else None,
        ))
    return output


@router.post("/export")
async def export_dataset(
    fmt: str = Query("alpaca", pattern="^(alpaca|chatml)$"),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    jsonl, count = await export(db, fmt=fmt)
    filename = f"brewai_dataset_{fmt}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.jsonl"
    return PlainTextResponse(
        content=jsonl,
        media_type="application/x-ndjson",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "X-Record-Count": str(count)},
    )
