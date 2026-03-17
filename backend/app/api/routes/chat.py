import base64
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.base import get_db
from app.db.models.session import ChatSession
from app.db.models.run import Run
from app.db.models.user import User
from app.services import ollama as ollama_service
from app.services.run_logger import log_run
from app.services.router import Route, classify, RouteResult
from app.services.ollama import resolve_model, get_system_prompt
from app.services.pdf_processor import pdf_bytes_to_images, pdf_extract_text, is_pdf

router = APIRouter()


# ── Session endpoints ─────────────────────────────────────────────────────────

class SessionResponse(BaseModel):
    id: str
    title: str
    created_at: str
    model_config = {"from_attributes": True}


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    return [SessionResponse(id=str(s.id), title=s.title, created_at=s.created_at.isoformat()) for s in sessions]


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = ChatSession(user_id=user.id)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionResponse(id=str(session.id), title=session.title, created_at=session.created_at.isoformat())


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    await db.delete(session)
    await db.commit()


# ── Message history ───────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: str
    latency_ms: int | None
    model_name: str | None = None


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    runs_result = await db.execute(
        select(Run).where(Run.session_id == session_id).order_by(Run.created_at.asc())
    )
    runs = runs_result.scalars().all()

    messages = []
    for run in runs:
        messages.append(MessageResponse(
            id=str(run.id) + "_user", role="user", content=run.prompt,
            created_at=run.created_at.isoformat(), latency_ms=None, model_name=None,
        ))
        messages.append(MessageResponse(
            id=str(run.id), role="assistant", content=run.response,
            created_at=run.created_at.isoformat(), latency_ms=run.latency_ms,
            model_name=run.model_name,
        ))
    return messages


# ── Streaming chat with AI gateway routing ───────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message: str
    show_thinking: bool = False
    model: str | None = None
    mode: str = "auto"  # auto | general | coder | ocr


@router.post("/stream")
async def stream_chat(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate session belongs to user
    session_id = uuid.UUID(req.session_id)
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Build message history (last 20 turns)
    runs_result = await db.execute(
        select(Run).where(Run.session_id == session_id).order_by(Run.created_at.desc()).limit(20)
    )
    past_runs = list(reversed(runs_result.scalars().all()))
    history = []
    for run in past_runs:
        history.append({"role": "user", "content": run.prompt})
        history.append({"role": "assistant", "content": run.response})
    history.append({"role": "user", "content": req.message})

    # Update session title on first message
    if not past_runs:
        session.title = req.message[:60] + ("..." if len(req.message) > 60 else "")
        await db.commit()

    # ── AI Gateway Routing ───────────────────────────────────────────────
    if req.mode != "auto" and req.mode in ("general", "coder", "ocr"):
        # Manual mode override
        route_result = RouteResult(
            route=Route(req.mode),
            reason=f"Manual mode: {req.mode}",
        )
    else:
        route_result = classify(req.message, has_files=False, file_types=[])

    # Resolve model(s) for the route
    if req.model:
        # User explicitly picked a model — override routing
        model_name = req.model
        system_prompt = get_system_prompt(route_result.route)
        route_result.reason = f"User override: {req.model}"
        use_pipeline = False
    else:
        models = resolve_model(route_result.route)
        if isinstance(models, list):
            # Pipeline route (OCR → reasoning)
            use_pipeline = True
            model_name = models[-1]  # final model for logging
        else:
            use_pipeline = False
            model_name = models
        system_prompt = get_system_prompt(route_result.route)

    route_result.models = [model_name] if not use_pipeline else resolve_model(route_result.route)

    async def event_generator():
        full_response = ""
        stats = {}
        run_id = None

        try:
            # Send route info as first event
            yield {"data": json.dumps({
                "route": {
                    "name": route_result.route.value,
                    "models": route_result.models if isinstance(route_result.models, list) else [route_result.models],
                    "reason": route_result.reason,
                }
            })}

            # Stream from appropriate model
            async for delta, chunk_stats in ollama_service.stream_chat(
                history,
                model=model_name,
                system_prompt=system_prompt,
                show_thinking=req.show_thinking,
            ):
                if delta:
                    full_response += delta
                    yield {"data": json.dumps({"delta": delta})}
                if chunk_stats:
                    stats = chunk_stats

            # Persist run after stream completes
            run = await log_run(
                db=db,
                session_id=session_id,
                user_id=user.id,
                prompt=req.message,
                response=full_response,
                system_prompt=system_prompt,
                model_name=stats.get("model", model_name),
                tokens_in=stats.get("tokens_in"),
                tokens_out=stats.get("tokens_out"),
                latency_ms=stats.get("latency_ms"),
            )
            run_id = str(run.id)

        except (ConnectionError, TimeoutError) as e:
            yield {"data": json.dumps({"error": str(e)})}
        except Exception as e:
            yield {"data": json.dumps({"error": "Unexpected error: " + str(e)})}
        finally:
            yield {"data": json.dumps({"done": True, "run_id": run_id})}

    return EventSourceResponse(event_generator())


# ── File upload + streaming chat (multipart) ─────────────────────────────────

@router.post("/stream-with-files")
async def stream_chat_with_files(
    session_id: str = Form(...),
    message: str = Form(...),
    show_thinking: bool = Form(False),
    mode: str = Form("auto"),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chat endpoint that accepts file uploads (images for OCR)."""
    # Validate session
    sid = uuid.UUID(session_id)
    result = await db.execute(select(ChatSession).where(ChatSession.id == sid, ChatSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Build history
    runs_result = await db.execute(
        select(Run).where(Run.session_id == sid).order_by(Run.created_at.desc()).limit(20)
    )
    past_runs = list(reversed(runs_result.scalars().all()))
    history = []
    for run in past_runs:
        history.append({"role": "user", "content": run.prompt})
        history.append({"role": "assistant", "content": run.response})
    history.append({"role": "user", "content": message})

    if not past_runs:
        session.title = message[:60] + ("..." if len(message) > 60 else "")
        await db.commit()

    # Read uploaded files — smart PDF handling: native text first, OCR fallback
    images_b64: list[str] = []
    file_types: list[str] = []
    pdf_native_text: str | None = None  # Set if we extract text directly from PDF
    for f in files:
        content = await f.read()
        content_type = f.content_type or "application/octet-stream"

        if is_pdf(content_type, f.filename):
            # Try native text extraction first (instant, perfect for digital PDFs)
            pdf_native_text = pdf_extract_text(content)
            if pdf_native_text is None:
                # Scanned PDF — fall back to image conversion for OCR
                try:
                    page_images = pdf_bytes_to_images(content)
                    images_b64.extend(page_images)
                    file_types.extend(["image/png"] * len(page_images))
                except ValueError as e:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=str(e),
                    )
        else:
            images_b64.append(base64.b64encode(content).decode("utf-8"))
            file_types.append(content_type)

    has_files = len(files) > 0

    # ── Route ────────────────────────────────────────────────────────────
    if mode != "auto" and mode in ("general", "coder", "ocr"):
        route_result = RouteResult(
            route=Route(mode),
            reason=f"Manual mode: {mode}",
        )
    else:
        route_result = classify(message, has_files=has_files, file_types=file_types)

    models = resolve_model(route_result.route)
    is_pipeline = isinstance(models, list)
    system_prompt = get_system_prompt(route_result.route)

    if is_pipeline:
        model_name = models[-1]
        route_result.models = models
    else:
        model_name = models
        route_result.models = [models]

    async def event_generator():
        full_response = ""
        stats = {}
        run_id = None

        try:
            # Send route info
            yield {"data": json.dumps({
                "route": {
                    "name": route_result.route.value,
                    "models": route_result.models if isinstance(route_result.models, list) else [route_result.models],
                    "reason": route_result.reason,
                }
            })}

            if pdf_native_text:
                # Digital PDF — text already extracted natively (no OCR needed)
                yield {"data": json.dumps({"delta": f"**Extracted text (native):**\n```\n{pdf_native_text}\n```\n\n**Processing...**\n\n"})}
                full_response += f"**Extracted text (native):**\n```\n{pdf_native_text}\n```\n\n**Processing...**\n\n"

                # Feed extracted text to reasoning model directly
                augmented_messages = history[:-1].copy()
                augmented_messages.append({"role": "user", "content": (
                    f"The user uploaded a PDF. Here is the extracted text:\n\n"
                    f"---\n{pdf_native_text}\n---\n\n"
                    f"User's request: {message}\n\n"
                    f"Please respond to the user's request based on the extracted text above."
                )})
                gen = ollama_service.stream_chat(
                    augmented_messages,
                    model=model_name,
                    system_prompt=system_prompt,
                    show_thinking=show_thinking,
                )
            elif is_pipeline and images_b64:
                # Scanned PDF or image — OCR → reasoning pipeline
                gen = ollama_service.stream_ocr_then_chat(
                    messages=history,
                    second_model=model_name,
                    system_prompt=system_prompt,
                    images=images_b64,
                    show_thinking=show_thinking,
                )
            elif images_b64:
                # Direct OCR or vision model
                gen = ollama_service.stream_chat(
                    history,
                    model=model_name,
                    system_prompt=system_prompt,
                    show_thinking=show_thinking,
                    images=images_b64,
                )
            else:
                # No files, standard chat
                gen = ollama_service.stream_chat(
                    history,
                    model=model_name,
                    system_prompt=system_prompt,
                    show_thinking=show_thinking,
                )

            async for delta, chunk_stats in gen:
                if delta:
                    full_response += delta
                    yield {"data": json.dumps({"delta": delta})}
                if chunk_stats:
                    stats = chunk_stats

            run = await log_run(
                db=db,
                session_id=sid,
                user_id=user.id,
                prompt=message,
                response=full_response,
                system_prompt=system_prompt,
                model_name=stats.get("model", model_name),
                tokens_in=stats.get("tokens_in"),
                tokens_out=stats.get("tokens_out"),
                latency_ms=stats.get("latency_ms"),
            )
            run_id = str(run.id)

        except (ConnectionError, TimeoutError) as e:
            yield {"data": json.dumps({"error": str(e)})}
        except Exception as e:
            yield {"data": json.dumps({"error": "Unexpected error: " + str(e)})}
        finally:
            yield {"data": json.dumps({"done": True, "run_id": run_id})}

    return EventSourceResponse(event_generator())
