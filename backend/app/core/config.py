from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

# Look for .env in backend/ first, then project root (BrewAI/)
_HERE = Path(__file__).resolve().parent          # app/core/
_BACKEND = _HERE.parent.parent                   # backend/
_ROOT = _BACKEND.parent                          # BrewAI/
_ENV_FILE = _BACKEND / ".env" if (_BACKEND / ".env").exists() else _ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://brewai:changeme@postgres:5432/brewai"

    # Ollama — external GPU server
    OLLAMA_HOST: str = "http://138.197.147.64:11434"
    OLLAMA_MODEL: str = "bazobehram/qwen3-14b-claude-4.5-opus-high-reasoning"
    OLLAMA_TIMEOUT: int = 300  # seconds

    # AI Gateway — model routing
    OLLAMA_MODEL_GENERAL: str = "qwen3:14b"
    OLLAMA_MODEL_CODER: str = "qwen2.5-coder:14b"
    OLLAMA_MODEL_OCR: str = "gemma3:12b"
    ROUTE_MODE: str = "auto"  # auto | general | coder | ocr

    # Auth
    SECRET_KEY: str = "CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Fine-tune
    GPU_SERVER_FINETUNE_URL: str = "http://localhost:8080/finetune"
    MIN_TRAINING_EXAMPLES: int = 10  # minimum approved examples before allowing fine-tune

    # App
    APP_NAME: str = "BrewAI"
    DEBUG: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://frontend:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
