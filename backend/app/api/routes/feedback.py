import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core import metrics
from app.db.base import get_db
from app.db.models.feedback import Feedback
from app.db.models.run import Run
from app.db.models.user import User

router = APIRouter()


class FeedbackRequest(BaseModel):
    run_id: str
    rating: int  # 1 or -1
    correction: str | None = None


class FeedbackResponse(BaseModel):
    id: str
    run_id: str
    rating: int
    correction: str | None
    approved_for_training: bool
    created_at: str


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    req: FeedbackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.rating not in (1, -1):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rating must be 1 or -1")

    run_id = uuid.UUID(req.run_id)
    result = await db.execute(select(Run).where(Run.id == run_id, Run.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    # Upsert — replace existing feedback for this run
    existing = await db.execute(select(Feedback).where(Feedback.run_id == run_id))
    fb = existing.scalar_one_or_none()
    if fb:
        fb.rating = req.rating
        fb.correction = req.correction
    else:
        fb = Feedback(run_id=run_id, user_id=user.id, rating=req.rating, correction=req.correction)
        db.add(fb)

    await db.commit()
    await db.refresh(fb)

    label = "positive" if req.rating == 1 else "negative"
    metrics.feedback_total.labels(rating=label).inc()

    return FeedbackResponse(
        id=str(fb.id),
        run_id=str(fb.run_id),
        rating=fb.rating,
        correction=fb.correction,
        approved_for_training=fb.approved_for_training,
        created_at=fb.created_at.isoformat(),
    )


@router.patch("/{feedback_id}/approve", response_model=FeedbackResponse)
async def approve_feedback(
    feedback_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    fb.approved_for_training = not fb.approved_for_training
    await db.commit()
    await db.refresh(fb)

    return FeedbackResponse(
        id=str(fb.id),
        run_id=str(fb.run_id),
        rating=fb.rating,
        correction=fb.correction,
        approved_for_training=fb.approved_for_training,
        created_at=fb.created_at.isoformat(),
    )
