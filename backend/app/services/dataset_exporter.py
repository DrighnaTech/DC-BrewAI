import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.feedback import Feedback
from app.db.models.run import Run


async def get_approved_runs(db: AsyncSession) -> list[dict]:
    """Fetch all approved-for-training runs with their feedback."""
    result = await db.execute(
        select(Run)
        .join(Feedback, Feedback.run_id == Run.id)
        .where(Feedback.approved_for_training == True)  # noqa: E712
        .options(selectinload(Run.feedback))
        .order_by(Run.created_at.asc())
    )
    runs = result.scalars().all()

    records = []
    for run in runs:
        fb = run.feedback
        output = fb.correction if fb and fb.correction else run.response
        records.append({
            "prompt": run.prompt,
            "system_prompt": run.system_prompt or "",
            "response": run.response,
            "output": output,  # preferred output (correction if available)
            "model": run.model_name,
        })
    return records


def to_alpaca_jsonl(records: list[dict]) -> str:
    """
    Alpaca format — works with Unsloth, LLaMA-Factory.
    {"instruction": ..., "input": ..., "output": ...}
    """
    lines = []
    for r in records:
        lines.append(json.dumps({
            "instruction": r["system_prompt"] or "You are BrewAI, an analytics copilot.",
            "input": r["prompt"],
            "output": r["output"],
        }))
    return "\n".join(lines)


def to_chatml_jsonl(records: list[dict]) -> str:
    """
    ChatML / ShareGPT format — works with Axolotl, Unsloth chat templates.
    """
    lines = []
    for r in records:
        messages = []
        if r["system_prompt"]:
            messages.append({"role": "system", "content": r["system_prompt"]})
        messages.append({"role": "user", "content": r["prompt"]})
        messages.append({"role": "assistant", "content": r["output"]})
        lines.append(json.dumps({"messages": messages}))
    return "\n".join(lines)


async def export(db: AsyncSession, fmt: str = "alpaca") -> tuple[str, int]:
    """Returns (jsonl_string, record_count)."""
    records = await get_approved_runs(db)
    if fmt == "chatml":
        return to_chatml_jsonl(records), len(records)
    return to_alpaca_jsonl(records), len(records)
