import base64
import json
import re
import time
from typing import AsyncGenerator

import httpx
import structlog

from app.core.config import settings
from app.services.router import Route

log = structlog.get_logger()

# ── System prompts per route ─────────────────────────────────────────────────

SYSTEM_GENERAL = """/no_think
You are Brew Chat v1, part of the BrewAI Gateway by DataCaffe. Keep responses SHORT and direct — 2-4 sentences for simple questions, longer only when the user asks for detail. No filler, no preamble.
If you don't have enough context, ask for clarification rather than guessing."""

SYSTEM_CODER = """/no_think
You are Brew Code v1, part of the BrewAI Gateway by DataCaffe. Write clean, production-ready code with brief explanations. Keep responses focused — code first, minimal commentary. Use the same language/framework the user is working with unless asked otherwise."""

SYSTEM_OCR = """/no_think
You are Brew OCR v1, part of the BrewAI Gateway by DataCaffe. Your ONLY job is to read and transcribe the exact text visible in the image.
Rules:
- Output ONLY the text that is literally visible in the image — nothing more, nothing less
- STOP immediately when you reach the end of the visible text. Do NOT continue or extrapolate
- Do NOT generate, invent, guess, or fabricate any content beyond what is visible
- Do NOT repeat patterns or extend lists beyond what actually appears in the image
- Do NOT write tutorials, code, examples, or commentary
- Preserve original formatting, layout, and language exactly as shown
- If text is unclear, write [unclear]
- If no text is found, say "No text found in image"
- When you have transcribed all visible text, STOP. Do not add anything else.
"""

# ── Thinking block stripping ─────────────────────────────────────────────────

_THINK_OPEN = ["<think>", "<thought>"]
_THINK_CLOSE = ["</think>", "</thought>"]
_THINK_BUFFER_LIMIT = 16384


def _strip_leading_tags(text: str) -> str:
    all_tags = _THINK_OPEN + _THINK_CLOSE
    changed = True
    while changed:
        changed = False
        text = text.lstrip("\n").lstrip()
        for tag in all_tags:
            if text.startswith(tag):
                text = text[len(tag):]
                changed = True
    return text.lstrip("\n")


def _might_be_partial_tag(text: str) -> bool:
    for tag in _THINK_CLOSE + _THINK_OPEN:
        if tag.startswith(text):
            return True
    return False


# ── Model resolver ───────────────────────────────────────────────────────────

def resolve_model(route: Route) -> str | list[str]:
    """Return model name(s) for a route."""
    model_map = {
        Route.GENERAL: settings.OLLAMA_MODEL_GENERAL,
        Route.CODER: settings.OLLAMA_MODEL_CODER,
        Route.OCR: settings.OLLAMA_MODEL_OCR,
        Route.OCR_GENERAL: [settings.OLLAMA_MODEL_OCR, settings.OLLAMA_MODEL_GENERAL],
        Route.OCR_CODER: [settings.OLLAMA_MODEL_OCR, settings.OLLAMA_MODEL_CODER],
    }
    return model_map.get(route, settings.OLLAMA_MODEL_GENERAL)


def get_system_prompt(route: Route) -> str:
    prompt_map = {
        Route.GENERAL: SYSTEM_GENERAL,
        Route.CODER: SYSTEM_CODER,
        Route.OCR: SYSTEM_OCR,
        Route.OCR_GENERAL: SYSTEM_GENERAL,
        Route.OCR_CODER: SYSTEM_CODER,
    }
    return prompt_map.get(route, SYSTEM_GENERAL)


# ── Core streaming function ──────────────────────────────────────────────────

async def stream_chat(
    messages: list[dict],
    model: str | None = None,
    system_prompt: str | None = None,
    show_thinking: bool = False,
    images: list[str] | None = None,
) -> AsyncGenerator[tuple[str, dict], None]:
    """
    Stream chat from Ollama, suppressing thinking blocks.
    images: list of base64-encoded image strings (for vision/OCR models).
    """
    model = model or settings.OLLAMA_MODEL
    system = system_prompt or SYSTEM_GENERAL

    # Build messages payload
    ollama_messages = [{"role": "system", "content": system}]
    for msg in messages[:-1]:
        ollama_messages.append({"role": msg["role"], "content": msg["content"]})

    # Last message may include images
    last_msg = messages[-1].copy()
    last_entry = {"role": last_msg["role"], "content": last_msg["content"]}
    if images:
        last_entry["images"] = images
    ollama_messages.append(last_entry)

    payload = {
        "model": model,
        "messages": ollama_messages,
        "stream": True,
        "think": False,
        "options": {
            "temperature": 0.7,
            "num_ctx": 4096,
            "num_predict": 1024,
        },
    }

    start = time.time()
    stats = {}

    try:
        async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
            async with client.stream(
                "POST", f"{settings.OLLAMA_HOST}/api/chat", json=payload
            ) as response:
                response.raise_for_status()

                state = 0
                buffer = ""

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if chunk.get("done"):
                        if state < 2 and buffer:
                            if state == 1:
                                clean = _strip_leading_tags(buffer)
                            else:
                                found_close = -1
                                found_tag = ""
                                for tag in _THINK_CLOSE:
                                    pos = buffer.find(tag)
                                    if pos != -1 and (found_close == -1 or pos < found_close):
                                        found_close = pos
                                        found_tag = tag
                                if found_close != -1:
                                    clean = _strip_leading_tags(buffer[found_close + len(found_tag):])
                                else:
                                    clean = _strip_leading_tags(buffer)
                            if clean:
                                yield (clean, {})

                        stats = {
                            "tokens_in": chunk.get("prompt_eval_count", 0),
                            "tokens_out": chunk.get("eval_count", 0),
                            "latency_ms": int((time.time() - start) * 1000),
                            "model": model,
                        }
                        yield ("", stats)
                        break

                    delta = chunk.get("message", {}).get("content", "")
                    if not delta:
                        continue

                    if show_thinking:
                        yield (delta, {})
                        continue

                    if state == 2:
                        yield (delta, {})
                        continue

                    buffer += delta

                    if state == 0:
                        found_close = -1
                        found_tag = ""
                        for tag in _THINK_CLOSE:
                            pos = buffer.find(tag)
                            if pos != -1 and (found_close == -1 or pos < found_close):
                                found_close = pos
                                found_tag = tag

                        if found_close != -1:
                            buffer = buffer[found_close + len(found_tag):]
                            state = 1
                        elif len(buffer) > _THINK_BUFFER_LIMIT:
                            state = 2
                            clean = _strip_leading_tags(buffer)
                            buffer = ""
                            if clean:
                                yield (clean, {})
                            continue
                        else:
                            continue

                    if state == 1:
                        buffer = _strip_leading_tags(buffer)
                        if buffer and not _might_be_partial_tag(buffer):
                            state = 2
                            yield (buffer, {})
                            buffer = ""

    except httpx.ConnectError:
        raise ConnectionError(
            f"Cannot connect to Ollama at {settings.OLLAMA_HOST}. Is the GPU server running?"
        )
    except httpx.TimeoutException:
        raise TimeoutError(
            "Ollama request timed out. The model may be loading — try again."
        )


# ── OCR-only call (non-streaming, returns full text) ─────────────────────────

async def ocr_extract(images: list[str], prompt: str = "Extract all text from this image.") -> str:
    """
    Run OCR model on images and return the extracted text (non-streaming).
    For multi-page documents (PDFs), processes each page separately and combines results.
    images: list of base64-encoded image strings.
    """
    model = settings.OLLAMA_MODEL_OCR

    # For single image, send directly
    if len(images) <= 1:
        return await _ocr_single(model, images, prompt)

    # For multi-page (PDF), process each page and combine
    all_text: list[str] = []
    for i, img in enumerate(images):
        page_prompt = f"Extract all text from page {i + 1}."
        page_text = await _ocr_single(model, [img], page_prompt)
        if page_text:
            all_text.append(f"--- Page {i + 1} ---\n{page_text}")

    return "\n\n".join(all_text)


def _truncate_repetition(text: str, min_block_len: int = 40, max_repeats: int = 2) -> str:
    """
    Detect and truncate repetitive hallucinated blocks in OCR output.
    If the same block of text (>= min_block_len chars) repeats more than
    max_repeats times, cut the output at the end of the allowed repeats.
    """
    if len(text) < min_block_len * 3:
        return text

    lines = text.split("\n")
    # Look for repeated line sequences (sliding window)
    for window_size in range(3, min(20, len(lines) // 3)):
        for start in range(len(lines) - window_size * 2):
            block = "\n".join(lines[start:start + window_size]).strip()
            if len(block) < min_block_len:
                continue

            repeat_count = 1
            pos = start + window_size
            while pos + window_size <= len(lines):
                candidate = "\n".join(lines[pos:pos + window_size]).strip()
                # Check similarity (allow minor differences)
                if candidate == block or _similar(candidate, block):
                    repeat_count += 1
                    pos += window_size
                else:
                    break

            if repeat_count > max_repeats:
                # Truncate after max_repeats occurrences
                cut_at = start + window_size * max_repeats
                truncated = "\n".join(lines[:cut_at]).rstrip()
                log.warning(
                    "ocr_repetition_detected",
                    repeats=repeat_count,
                    window_size=window_size,
                    truncated_at_line=cut_at,
                )
                return truncated + "\n\n[... repetitive content truncated]"

    return text


def _similar(a: str, b: str, threshold: float = 0.85) -> bool:
    """Quick similarity check — if strings share >threshold of their characters."""
    if not a or not b:
        return False
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) / len(longer) < threshold:
        return False
    matches = sum(1 for ca, cb in zip(shorter, longer) if ca == cb)
    return matches / len(longer) >= threshold


async def _ocr_single(model: str, images: list[str], prompt: str) -> str:
    """Run OCR on a single image or page."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_OCR},
            {"role": "user", "content": prompt, "images": images},
        ],
        "stream": False,
        "think": False,
        "options": {
            "temperature": 0.05,
            "num_ctx": 4096,
            "num_predict": 1536,
            "repeat_penalty": 1.3,
            "repeat_last_n": 256,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
            r = await client.post(f"{settings.OLLAMA_HOST}/api/chat", json=payload)
            r.raise_for_status()
            data = r.json()
            raw_text = data.get("message", {}).get("content", "").strip()
            # Post-process: detect and truncate hallucinated repetitions
            return _truncate_repetition(raw_text)
    except httpx.ConnectError:
        raise ConnectionError(f"Cannot connect to Ollama OCR at {settings.OLLAMA_HOST}")
    except httpx.TimeoutException:
        raise TimeoutError("OCR request timed out")


# ── Pipeline: OCR → then stream with another model ──────────────────────────

async def stream_ocr_then_chat(
    messages: list[dict],
    second_model: str,
    system_prompt: str,
    images: list[str],
    show_thinking: bool = False,
) -> AsyncGenerator[tuple[str, dict], None]:
    """
    Two-stage pipeline:
      1. OCR model extracts text from images (non-streaming)
      2. Second model (general/coder) processes the extracted text (streaming)

    Yields a status message during OCR, then streams the final response.
    """
    # Stage 1: OCR extraction
    page_count = len(images)
    if page_count > 1:
        yield (f"[Extracting text from {page_count} pages...]\n\n", {})
    else:
        yield ("[Extracting text from image...]\n\n", {})

    user_message = messages[-1]["content"] if messages else ""
    ocr_text = await ocr_extract(images, prompt=user_message)

    if not ocr_text:
        yield ("Could not extract any text from the uploaded file.", {})
        yield ("", {"model": settings.OLLAMA_MODEL_OCR, "tokens_in": 0, "tokens_out": 0, "latency_ms": 0})
        return

    # Yield the extracted text as context indicator
    yield (f"**Extracted text:**\n```\n{ocr_text}\n```\n\n**Processing...**\n\n", {})

    # Stage 2: Feed OCR result to the reasoning model
    augmented_messages = messages[:-1].copy()
    augmented_prompt = (
        f"The user uploaded an image. Here is the extracted text from OCR:\n\n"
        f"---\n{ocr_text}\n---\n\n"
        f"User's request: {user_message}\n\n"
        f"Please respond to the user's request based on the extracted text above."
    )
    augmented_messages.append({"role": "user", "content": augmented_prompt})

    async for delta, stats in stream_chat(
        augmented_messages,
        model=second_model,
        system_prompt=system_prompt,
        show_thinking=show_thinking,
    ):
        yield (delta, stats)


# ── List models ──────────────────────────────────────────────────────────────

async def list_local_models() -> list[dict]:
    """List models available in Ollama."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{settings.OLLAMA_HOST}/api/tags")
            r.raise_for_status()
            return r.json().get("models", [])
    except Exception as e:
        log.warning("Failed to list Ollama models", error=str(e))
        return []
