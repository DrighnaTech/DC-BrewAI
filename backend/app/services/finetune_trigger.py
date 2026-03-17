import httpx
import structlog

from app.core.config import settings

log = structlog.get_logger()


async def trigger_finetune(jsonl_data: str, export_format: str, dataset_size: int) -> dict:
    """
    POST the JSONL dataset to the GPU server's fine-tune endpoint.
    The GPU server is responsible for running unsloth/llama.cpp training.
    """
    payload = {
        "format": export_format,
        "dataset_size": dataset_size,
        "data": jsonl_data,
        "base_model": settings.OLLAMA_MODEL,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(settings.GPU_SERVER_FINETUNE_URL, json=payload)
            r.raise_for_status()
            return r.json()
    except httpx.ConnectError:
        log.warning("GPU server unreachable", url=settings.GPU_SERVER_FINETUNE_URL)
        # Return a mock response for dev/testing when GPU server isn't set up yet
        return {"job_id": "mock-job", "status": "queued", "message": "GPU server not reachable — mocked response"}
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"GPU server returned {e.response.status_code}: {e.response.text}")
