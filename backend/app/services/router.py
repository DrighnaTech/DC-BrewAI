"""
AI Gateway Router — decides which Ollama model handles each request.

Routes:
  general  → qwen3:32b          (chat, summaries, business tasks)
  coder    → qwen2.5-coder:32b  (code, SQL, debugging, DevOps)
  ocr      → deepseek-ocr       (image text extraction)
  ocr+general → OCR then general (image + interpret/summarize)
  ocr+coder  → OCR then coder   (screenshot errors, code from images)
"""

import re
from dataclasses import dataclass, field
from enum import Enum


class Route(str, Enum):
    GENERAL = "general"
    CODER = "coder"
    OCR = "ocr"
    OCR_GENERAL = "ocr_then_general"
    OCR_CODER = "ocr_then_coder"


@dataclass
class RouteResult:
    route: Route
    models: list[str] = field(default_factory=list)
    reason: str = ""


# ── Keyword sets ─────────────────────────────────────────────────────────────

_CODE_KEYWORDS = {
    "code", "coding", "debug", "debugging", "bug", "fix", "error",
    "python", "javascript", "typescript", "react", "next.js", "nextjs",
    "fastapi", "flask", "django", "express", "node",
    "sql", "query", "database", "postgres", "mysql", "mongodb",
    "api", "endpoint", "rest", "graphql", "grpc",
    "function", "class", "method", "variable", "loop", "array",
    "html", "css", "tailwind", "component",
    "docker", "kubernetes", "k8s", "nginx", "deploy", "devops",
    "git", "commit", "merge", "branch", "pull request",
    "bash", "shell", "script", "terminal", "command",
    "algorithm", "data structure", "regex", "json", "yaml",
    "test", "unittest", "pytest", "jest", "lint",
    "import", "export", "package", "dependency", "npm", "pip",
    "compiler", "runtime", "exception", "traceback", "stack trace",
    "refactor", "optimize", "performance", "memory", "async", "await",
    "webhook", "middleware", "authentication", "authorization",
    "write code", "fix bug", "build api", "create function",
    "implement", "snippet", "syntax", "type error", "null pointer",
    "segfault", "cors", "403", "404", "500", "status code",
    "rust", "go", "golang", "java", "c++", "swift", "kotlin",
    "vue", "angular", "svelte", "redux", "zustand",
    "lambda", "serverless", "aws", "azure", "gcp",
}

_OCR_KEYWORDS = {
    "extract text", "read text", "ocr", "scan", "screenshot",
    "image text", "read this", "what does this say",
    "invoice", "receipt", "document", "form", "pdf",
    "handwriting", "printed text", "caption",
    "extract from image", "text from image", "read image",
    "what's in this image", "transcribe",
}

_OCR_THEN_CODE_KEYWORDS = {
    "fix this error", "solve this error", "debug this",
    "what's wrong", "error in screenshot", "fix this code",
    "error message", "stack trace", "traceback",
    "solve this", "help with this error",
}


def _normalize(text: str) -> str:
    return text.lower().strip()


def _has_keyword_match(text: str, keywords: set[str]) -> tuple[bool, str]:
    """Check if text contains any keyword. Returns (matched, keyword)."""
    text_lower = _normalize(text)
    for kw in keywords:
        # Multi-word keywords: check as substring
        if " " in kw:
            if kw in text_lower:
                return True, kw
        else:
            # Single word: check word boundaries
            if re.search(rf"\b{re.escape(kw)}\b", text_lower):
                return True, kw
    return False, ""


def classify(message: str, has_files: bool = False, file_types: list[str] | None = None) -> RouteResult:
    """
    Classify a user message into a route.

    Priority:
      1. File present + OCR signals → OCR routes
      2. Code keywords → coder
      3. Everything else → general
    """
    file_types = file_types or []
    has_image = has_files and any(
        ft in ("image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp", "image/tiff",
               "application/pdf")
        for ft in file_types
    )

    # ── Route 1: Image/file present ──────────────────────────────────────────
    if has_image or has_files:
        # Check for OCR + code pattern (error screenshots)
        matched, kw = _has_keyword_match(message, _OCR_THEN_CODE_KEYWORDS)
        if matched:
            return RouteResult(
                route=Route.OCR_CODER,
                reason=f"Image + code-related keyword: '{kw}'",
            )

        # Check for explicit OCR request
        matched, kw = _has_keyword_match(message, _OCR_KEYWORDS)
        if matched:
            return RouteResult(
                route=Route.OCR,
                reason=f"Image + OCR keyword: '{kw}'",
            )

        # Check for code keywords with image → OCR then coder
        matched, kw = _has_keyword_match(message, _CODE_KEYWORDS)
        if matched:
            return RouteResult(
                route=Route.OCR_CODER,
                reason=f"Image + code keyword: '{kw}'",
            )

        # Default: OCR → general (interpret the image content)
        return RouteResult(
            route=Route.OCR_GENERAL,
            reason="Image attached — OCR then general interpretation",
        )

    # ── Route 2: Code keywords (no file) ─────────────────────────────────────
    matched, kw = _has_keyword_match(message, _CODE_KEYWORDS)
    if matched:
        return RouteResult(
            route=Route.CODER,
            reason=f"Code keyword: '{kw}'",
        )

    # ── Route 3: Default → general ───────────────────────────────────────────
    return RouteResult(
        route=Route.GENERAL,
        reason="General query — no specialized keywords detected",
    )
