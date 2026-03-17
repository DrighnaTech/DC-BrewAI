"""
API Key management — admin creates keys, users can view their own.
Keys use format: bai_<random40hex>
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.db.base import get_db
from app.db.models.api_key import ApiKey
from app.db.models.user import User

router = APIRouter()

VALID_SCOPES = {"general", "coder", "ocr"}


def _generate_key() -> tuple[str, str, str]:
    """Generate API key, return (full_key, key_hash, key_prefix)."""
    raw = secrets.token_hex(20)  # 40 hex chars
    full_key = f"bai_{raw}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    key_prefix = f"bai_{raw[:8]}..."
    return full_key, key_hash, key_prefix


# ── Request/Response models ──────────────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    name: str
    scopes: list[str] = ["general", "coder", "ocr"]
    rate_limit: int = 60  # requests per minute
    expires_in_days: int | None = None  # None = never expires


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    scopes: list[str]
    is_active: bool
    rate_limit: int
    total_requests: int
    created_at: str
    last_used_at: str | None
    expires_at: str | None


class ApiKeyCreatedResponse(ApiKeyResponse):
    key: str  # full key — shown only once on creation


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=ApiKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    req: CreateKeyRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API key (admin only). The full key is shown only once."""
    # Validate scopes
    for scope in req.scopes:
        if scope not in VALID_SCOPES:
            raise HTTPException(400, f"Invalid scope: {scope}. Valid: {', '.join(VALID_SCOPES)}")

    full_key, key_hash, key_prefix = _generate_key()

    expires_at = None
    if req.expires_in_days:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=req.expires_in_days)

    api_key = ApiKey(
        user_id=user.id,
        name=req.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=",".join(req.scopes),
        rate_limit=req.rate_limit,
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return ApiKeyCreatedResponse(
        id=str(api_key.id),
        name=api_key.name,
        key=full_key,
        key_prefix=key_prefix,
        scopes=req.scopes,
        is_active=True,
        rate_limit=req.rate_limit,
        total_requests=0,
        created_at=api_key.created_at.isoformat(),
        last_used_at=None,
        expires_at=api_key.expires_at.isoformat() if api_key.expires_at else None,
    )


@router.get("", response_model=list[ApiKeyResponse])
async def list_api_keys(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys (admin only)."""
    result = await db.execute(
        select(ApiKey).order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return [
        ApiKeyResponse(
            id=str(k.id),
            name=k.name,
            key_prefix=k.key_prefix,
            scopes=k.scopes.split(","),
            is_active=k.is_active,
            rate_limit=k.rate_limit,
            total_requests=k.total_requests,
            created_at=k.created_at.isoformat(),
            last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
            expires_at=k.expires_at.isoformat() if k.expires_at else None,
        )
        for k in keys
    ]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: uuid.UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (deactivate) an API key."""
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(404, "API key not found")

    api_key.is_active = False
    await db.commit()
