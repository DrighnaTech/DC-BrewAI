import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import metrics
from app.db.models.run import Run


async def log_run(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    prompt: str,
    response: str,
    system_prompt: str | None,
    model_name: str,
    tokens_in: int | None,
    tokens_out: int | None,
    latency_ms: int | None,
) -> Run:
    run = Run(
        session_id=session_id,
        user_id=user_id,
        prompt=prompt,
        response=response,
        system_prompt=system_prompt,
        model_name=model_name,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        latency_ms=latency_ms,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Prometheus metrics
    metrics.chat_requests_total.labels(model=model_name).inc()
    if latency_ms:
        metrics.chat_latency_seconds.labels(model=model_name).observe(latency_ms / 1000)
    if tokens_in:
        metrics.tokens_total.labels(direction="in").inc(tokens_in)
    if tokens_out:
        metrics.tokens_total.labels(direction="out").inc(tokens_out)

    return run
