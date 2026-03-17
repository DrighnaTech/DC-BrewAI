"""
DataCaffe LLM Gateway
OpenAI-compatible API gateway in front of Ollama with API key auth.
"""
import os
import sqlite3
import secrets
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Depends, Request, Header
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

DB_PATH = os.getenv("DB_PATH", "keys.db")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")  # MUST be set in production

# Models users are allowed to request
ALLOWED_MODELS = set(os.getenv("ALLOWED_MODELS", "qwen3.5:27b,devstral:24b,qwen3:14b").split(","))

app = FastAPI(title="DataCaffe LLM Gateway", version="1.0.0")
bearer_scheme = HTTPBearer(auto_error=False)


# ── DB setup ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name   TEXT NOT NULL,
            api_key     TEXT NOT NULL UNIQUE,
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usage_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key     TEXT NOT NULL,
            user_name   TEXT NOT NULL,
            model       TEXT NOT NULL,
            ip_address  TEXT,
            status_code INTEGER,
            created_at  TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup():
    if not ADMIN_TOKEN:
        raise RuntimeError("ADMIN_TOKEN env var must be set — generate one with: python3 -c \"import secrets; print(secrets.token_hex(32))\"")
    init_db()


# ── Auth dependencies ──────────────────────────────────────────────────────────

def validate_api_key(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    """Validate user API key from Authorization: Bearer sk_live_..."""
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = credentials.credentials
    conn = get_db()
    row = conn.execute(
        "SELECT user_name, api_key, is_active FROM api_keys WHERE api_key = ?",
        (token,),
    ).fetchone()
    conn.close()

    if not row or row["is_active"] != 1:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")

    return {"user_name": row["user_name"], "api_key": row["api_key"]}


def validate_admin(x_admin_token: str = Header(None)):
    """Validate admin token from X-Admin-Token header."""
    if not x_admin_token or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid admin token")


# ── Public endpoints ───────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "allowed_models": sorted(ALLOWED_MODELS)}


@app.get("/v1/models")
def list_models(api_user=Depends(validate_api_key)):
    """OpenAI-compatible model list."""
    return {
        "object": "list",
        "data": [
            {"id": m, "object": "model", "owned_by": "datacaffe"}
            for m in sorted(ALLOWED_MODELS)
        ],
    }


# ── Chat completions (streaming + non-streaming) ───────────────────────────────

class ChatRequest(BaseModel):
    model: str
    messages: list
    temperature: float | None = None
    max_tokens: int | None = None
    stream: bool | None = False
    top_p: float | None = None


@app.post("/v1/chat/completions")
async def chat_completions(
    payload: ChatRequest,
    request: Request,
    api_user=Depends(validate_api_key),
):
    if payload.model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{payload.model}' not allowed. Available: {sorted(ALLOWED_MODELS)}"
        )

    forward = payload.model_dump(exclude_none=True)

    # Log request
    _log_usage(api_user["api_key"], api_user["user_name"], payload.model, request)

    try:
        if payload.stream:
            # Stream through to client
            async def stream_generator():
                async with httpx.AsyncClient(timeout=600.0) as client:
                    async with client.stream(
                        "POST",
                        f"{OLLAMA_URL}/v1/chat/completions",
                        json=forward,
                    ) as resp:
                        async for chunk in resp.aiter_bytes():
                            yield chunk

            return StreamingResponse(stream_generator(), media_type="text/event-stream")
        else:
            async with httpx.AsyncClient(timeout=600.0) as client:
                resp = await client.post(
                    f"{OLLAMA_URL}/v1/chat/completions",
                    json=forward,
                )
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot reach Ollama — is it running?")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ollama timed out — model may still be loading")

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()


def _log_usage(api_key: str, user_name: str, model: str, request: Request, status: int = 200):
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO usage_logs (api_key, user_name, model, ip_address, status_code, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (api_key, user_name, model, request.client.host if request.client else None, status, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass  # Never let logging crash a request


# ── Admin endpoints (protected by X-Admin-Token header) ───────────────────────

@app.post("/admin/keys", dependencies=[Depends(validate_admin)])
def create_key(user_name: str):
    """Create a new API key for a user."""
    new_key = "sk_live_" + secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO api_keys (user_name, api_key, is_active, created_at) VALUES (?, ?, 1, ?)",
        (user_name, new_key, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()
    return {"user_name": user_name, "api_key": new_key}


@app.get("/admin/keys", dependencies=[Depends(validate_admin)])
def list_keys():
    """List all API keys."""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, user_name, api_key, is_active, created_at FROM api_keys ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.delete("/admin/keys/{api_key}", dependencies=[Depends(validate_admin)])
def revoke_key(api_key: str):
    """Revoke (deactivate) an API key."""
    conn = get_db()
    cur = conn.execute("UPDATE api_keys SET is_active = 0 WHERE api_key = ?", (api_key,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"revoked": True}


@app.get("/admin/usage", dependencies=[Depends(validate_admin)])
def usage_logs(limit: int = 100):
    """Recent usage logs."""
    conn = get_db()
    rows = conn.execute(
        "SELECT user_name, model, ip_address, status_code, created_at FROM usage_logs ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
