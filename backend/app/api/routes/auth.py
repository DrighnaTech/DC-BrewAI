from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.db.base import get_db
from app.db.models.user import User

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str

    model_config = {"from_attributes": True}


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(str(user.id), email=user.email),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(str(user.id), email=user.email),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return UserResponse(id=str(user.id), email=user.email, full_name=user.full_name, role=user.role)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """First-run registration — anyone can register. Lock this down after initial setup."""
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # First user gets admin role
    count_result = await db.execute(select(User))
    is_first = count_result.first() is None

    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        role="admin" if is_first else "user",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse(id=str(user.id), email=user.email, full_name=user.full_name, role=user.role)
