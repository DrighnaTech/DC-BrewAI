import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core import metrics
from app.core.config import settings
from app.db.base import get_db
from app.db.models.model_version import ModelVersion
from app.db.models.user import User
from app.services.ollama import list_local_models

router = APIRouter()


class ModelVersionResponse(BaseModel):
    id: str
    name: str
    ollama_model_id: str
    description: str | None
    is_active: bool
    created_at: str


class CreateModelRequest(BaseModel):
    name: str
    ollama_model_id: str
    description: str | None = None


@router.get("", response_model=list[ModelVersionResponse])
async def list_models(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ModelVersion).order_by(ModelVersion.created_at.desc()))
    return [_mv_to_response(m) for m in result.scalars().all()]


@router.get("/ollama", response_model=list[dict])
async def list_ollama_models(user: User = Depends(get_current_user)):
    """List models currently loaded in Ollama on the GPU server."""
    return await list_local_models()


@router.post("", response_model=ModelVersionResponse, status_code=status.HTTP_201_CREATED)
async def register_model(
    req: CreateModelRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    mv = ModelVersion(name=req.name, ollama_model_id=req.ollama_model_id, description=req.description, created_by=admin.id)
    db.add(mv)
    await db.commit()
    await db.refresh(mv)
    return _mv_to_response(mv)


@router.post("/{model_id}/activate", response_model=ModelVersionResponse)
async def activate_model(
    model_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ModelVersion).where(ModelVersion.id == model_id))
    mv = result.scalar_one_or_none()
    if not mv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model version not found")

    # Deactivate all others
    await db.execute(update(ModelVersion).values(is_active=False))
    mv.is_active = True

    # Update runtime config
    settings.OLLAMA_MODEL = mv.ollama_model_id

    await db.commit()
    await db.refresh(mv)

    metrics.active_model_info.labels(model_name=mv.ollama_model_id).set(1)
    return _mv_to_response(mv)


def _mv_to_response(m: ModelVersion) -> ModelVersionResponse:
    return ModelVersionResponse(
        id=str(m.id),
        name=m.name,
        ollama_model_id=m.ollama_model_id,
        description=m.description,
        is_active=m.is_active,
        created_at=m.created_at.isoformat(),
    )
