from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import settings
from app.api.routes import auth, chat, feedback, dataset, finetune, models, api_keys, gateway

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("BrewAI starting", ollama_host=settings.OLLAMA_HOST, model=settings.OLLAMA_MODEL)
    yield
    log.info("BrewAI shutting down")


app = FastAPI(
    title="BrewAI API",
    version="1.0.0",
    description="DataCaffe's BrewAI — self-hosted LLM platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics at /metrics
Instrumentator().instrument(app).expose(app)

# Routes
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
app.include_router(dataset.router, prefix="/dataset", tags=["dataset"])
app.include_router(finetune.router, prefix="/finetune", tags=["finetune"])
app.include_router(models.router, prefix="/models", tags=["models"])
app.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"])
app.include_router(gateway.router, prefix="/v1", tags=["gateway"])


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "platform": "BrewAI Gateway",
        "models": {
            "brew_chat_v1": settings.OLLAMA_MODEL_GENERAL,
            "brew_code_v1": settings.OLLAMA_MODEL_CODER,
            "brew_ocr_v1": settings.OLLAMA_MODEL_OCR,
        },
        "routing": settings.ROUTE_MODE,
    }
