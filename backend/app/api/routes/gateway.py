"""
BrewAI Gateway API v1.0.0 — external users call these with API keys.

Endpoints:
  POST /v1/chat    → Brew Chat v1
  POST /v1/code    → Brew Code v1
  POST /v1/ocr     → Brew OCR v1
  POST /v1/auto    → Auto-routed (smart routing)
"""
import base64
import hashlib
import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.config import settings
from app.db.base import get_db
from app.db.models.api_key import ApiKey
from app.services import ollama as ollama_service
from app.services.router import Route, classify, RouteResult
from app.services.ollama import resolve_model, get_system_prompt

router = APIRouter()


# ── Rate limiter (in-memory, per key) ────────────────────────────────────────

_rate_store: dict[str, list[float]] = {}


def _check_rate_limit(key_id: str, limit: int) -> bool:
    """Simple sliding-window rate limiter. Returns True if allowed."""
    now = time.time()
    window = _rate_store.get(key_id, [])
    # Keep only requests in the last 60 seconds
    window = [t for t in window if now - t < 60]
    if len(window) >= limit:
        return False
    window.append(now)
    _rate_store[key_id] = window
    return True


# ── API key dependency ───────────────────────────────────────────────────────

async def verify_api_key(
    authorization: str = Header(..., description="Bearer bai_xxx or just bai_xxx"),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    """Validate API key from Authorization header."""
    # Accept "Bearer bai_xxx" or just "bai_xxx"
    key = authorization.replace("Bearer ", "").strip()
    if not key.startswith("bai_"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key format. Expected: bai_xxx")

    key_hash = hashlib.sha256(key.encode()).hexdigest()
    result = await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    if not api_key.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "API key has been revoked")
    if api_key.expires_at and api_key.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "API key has expired")

    # Rate limit check
    if not _check_rate_limit(str(api_key.id), api_key.rate_limit):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Rate limit exceeded: {api_key.rate_limit} requests/minute",
        )

    # Update usage stats
    await db.execute(
        update(ApiKey)
        .where(ApiKey.id == api_key.id)
        .values(
            total_requests=ApiKey.total_requests + 1,
            last_used_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()

    return api_key


def _check_scope(api_key: ApiKey, required_scope: str):
    """Ensure the API key has the required scope."""
    scopes = api_key.scopes.split(",")
    if required_scope not in scopes:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"API key missing required scope: '{required_scope}'. Key scopes: {scopes}",
        )


# ── Request/Response models ──────────────────────────────────────────────────

class ChatRequestBody(BaseModel):
    message: str
    stream: bool = False
    system_prompt: str | None = None


class GatewayResponse(BaseModel):
    route: str
    model: str
    response: str
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0


# ── Helper: non-streaming call ───────────────────────────────────────────────

async def _call_model(
    message: str,
    model: str,
    system_prompt: str,
    stream: bool = False,
    route_name: str = "general",
    images: list[str] | None = None,
):
    """Call Ollama model and return response (streaming or non-streaming)."""
    messages = [{"role": "user", "content": message}]

    if stream:
        async def event_gen():
            full = ""
            stats = {}
            try:
                yield {"data": json.dumps({"route": route_name, "model": model})}
                async for delta, chunk_stats in ollama_service.stream_chat(
                    messages, model=model, system_prompt=system_prompt, images=images,
                ):
                    if delta:
                        full += delta
                        yield {"data": json.dumps({"delta": delta})}
                    if chunk_stats:
                        stats = chunk_stats
            except (ConnectionError, TimeoutError) as e:
                yield {"data": json.dumps({"error": str(e)})}
            finally:
                yield {"data": json.dumps({
                    "done": True,
                    "tokens_in": stats.get("tokens_in", 0),
                    "tokens_out": stats.get("tokens_out", 0),
                    "latency_ms": stats.get("latency_ms", 0),
                })}
        return EventSourceResponse(event_gen())

    # Non-streaming: collect full response
    full_response = ""
    stats = {}
    async for delta, chunk_stats in ollama_service.stream_chat(
        messages, model=model, system_prompt=system_prompt, images=images,
    ):
        if delta:
            full_response += delta
        if chunk_stats:
            stats = chunk_stats

    return GatewayResponse(
        route=route_name,
        model=model,
        response=full_response,
        tokens_in=stats.get("tokens_in", 0),
        tokens_out=stats.get("tokens_out", 0),
        latency_ms=stats.get("latency_ms", 0),
    )


# ── POST /v1/chat — General model ───────────────────────────────────────────

@router.post("/chat")
async def gateway_chat(
    req: ChatRequestBody,
    api_key: ApiKey = Depends(verify_api_key),
):
    """General chat using qwen3:32b."""
    _check_scope(api_key, "general")
    model = settings.OLLAMA_MODEL_GENERAL
    system = req.system_prompt or ollama_service.SYSTEM_GENERAL
    return await _call_model(req.message, model, system, req.stream, "general")


# ── POST /v1/code — Coder model ─────────────────────────────────────────────

@router.post("/code")
async def gateway_code(
    req: ChatRequestBody,
    api_key: ApiKey = Depends(verify_api_key),
):
    """Code assistance using qwen2.5-coder:32b."""
    _check_scope(api_key, "coder")
    model = settings.OLLAMA_MODEL_CODER
    system = req.system_prompt or ollama_service.SYSTEM_CODER
    return await _call_model(req.message, model, system, req.stream, "coder")


# ── POST /v1/ocr — OCR model ────────────────────────────────────────────────

@router.post("/ocr")
async def gateway_ocr(
    file: UploadFile = File(...),
    prompt: str = Form("Extract all text from this image."),
    api_key: ApiKey = Depends(verify_api_key),
):
    """OCR text extraction using deepseek-ocr."""
    _check_scope(api_key, "ocr")

    content = await file.read()
    image_b64 = base64.b64encode(content).decode("utf-8")

    model = settings.OLLAMA_MODEL_OCR
    start = time.time()
    extracted = await ollama_service.ocr_extract([image_b64], prompt=prompt)
    latency = int((time.time() - start) * 1000)

    return {
        "route": "ocr",
        "model": model,
        "extracted_text": extracted,
        "latency_ms": latency,
    }


# ── POST /v1/auto — Auto-routed ─────────────────────────────────────────────

@router.post("/auto")
async def gateway_auto(
    req: ChatRequestBody,
    api_key: ApiKey = Depends(verify_api_key),
):
    """Auto-routed: backend picks the best model based on message content."""
    route_result = classify(req.message, has_files=False, file_types=[])

    # Check scope for the chosen route
    scope_map = {
        Route.GENERAL: "general",
        Route.CODER: "coder",
        Route.OCR: "ocr",
        Route.OCR_GENERAL: "ocr",
        Route.OCR_CODER: "ocr",
    }
    _check_scope(api_key, scope_map.get(route_result.route, "general"))

    models = resolve_model(route_result.route)
    model = models[-1] if isinstance(models, list) else models
    system = req.system_prompt or get_system_prompt(route_result.route)

    return await _call_model(
        req.message, model, system, req.stream, route_result.route.value,
    )


# ── POST /v1/ocr-and-ask — OCR pipeline ─────────────────────────────────────

@router.post("/ocr-and-ask")
async def gateway_ocr_and_ask(
    file: UploadFile = File(...),
    prompt: str = Form("Extract and interpret the text from this image."),
    model_type: str = Form("general"),  # general | coder
    stream: bool = Form(False),
    api_key: ApiKey = Depends(verify_api_key),
):
    """
    Two-stage pipeline: OCR extracts text, then a reasoning model interprets it.
    model_type: 'general' or 'coder'
    """
    _check_scope(api_key, "ocr")
    scope_needed = "coder" if model_type == "coder" else "general"
    _check_scope(api_key, scope_needed)

    content = await file.read()
    image_b64 = base64.b64encode(content).decode("utf-8")

    # Stage 1: OCR
    extracted = await ollama_service.ocr_extract([image_b64], prompt="Extract all text from this image.")

    if not extracted:
        return {"route": "ocr", "model": settings.OLLAMA_MODEL_OCR, "extracted_text": "", "response": ""}

    # Stage 2: Reasoning model
    second_model = settings.OLLAMA_MODEL_CODER if model_type == "coder" else settings.OLLAMA_MODEL_GENERAL
    system = ollama_service.SYSTEM_CODER if model_type == "coder" else ollama_service.SYSTEM_GENERAL

    augmented = (
        f"OCR extracted text from an image:\n\n---\n{extracted}\n---\n\n"
        f"User's request: {prompt}\n\nRespond based on the extracted text."
    )

    messages = [{"role": "user", "content": augmented}]

    if stream:
        async def event_gen():
            stats = {}
            try:
                yield {"data": json.dumps({
                    "route": f"ocr_then_{model_type}",
                    "models": [settings.OLLAMA_MODEL_OCR, second_model],
                    "extracted_text": extracted,
                })}
                async for delta, chunk_stats in ollama_service.stream_chat(
                    messages, model=second_model, system_prompt=system,
                ):
                    if delta:
                        yield {"data": json.dumps({"delta": delta})}
                    if chunk_stats:
                        stats = chunk_stats
            except (ConnectionError, TimeoutError) as e:
                yield {"data": json.dumps({"error": str(e)})}
            finally:
                yield {"data": json.dumps({"done": True})}
        return EventSourceResponse(event_gen())

    full = ""
    async for delta, _ in ollama_service.stream_chat(messages, model=second_model, system_prompt=system):
        if delta:
            full += delta

    return {
        "route": f"ocr_then_{model_type}",
        "models": [settings.OLLAMA_MODEL_OCR, second_model],
        "extracted_text": extracted,
        "response": full,
    }
