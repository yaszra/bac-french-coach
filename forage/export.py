"""Exporters: turn normalized sessions into training-ready datasets.

Currently supports supervised fine-tuning (SFT) chat format — one JSON
object per session with a ``messages`` array, compatible with Hugging Face
TRL / Axolotl chat templates. Tool calls are preserved as structured
``tool_calls`` entries so trajectory behavior survives into training.
"""

from __future__ import annotations

import json
from pathlib import Path


def session_to_sft(session: dict) -> dict | None:
    """Convert one normalized session dict to an SFT example, or None if it
    contains no assistant output worth training on."""
    messages = []
    has_assistant = False
    for turn in session.get("turns", []):
        role = turn.get("role")
        if role == "user":
            messages.append({"role": "user", "content": turn.get("content", "")})
        elif role == "assistant":
            has_assistant = True
            if turn.get("tool_name"):
                messages.append(
                    {
                        "role": "assistant",
                        "content": turn.get("content", ""),
                        "tool_calls": [
                            {
                                "type": "function",
                                "function": {
                                    "name": turn["tool_name"],
                                    "arguments": json.dumps(turn.get("tool_input") or {}),
                                },
                            }
                        ],
                    }
                )
            else:
                messages.append({"role": "assistant", "content": turn.get("content", "")})
        elif role == "tool":
            messages.append({"role": "tool", "content": turn.get("tool_result", "")})
    if not has_assistant:
        return None
    return {
        "messages": messages,
        "meta": {
            "session_id": session.get("session_id"),
            "source": session.get("source"),
            "repo": session.get("repo"),
            "outcome": session.get("outcome", {}),
        },
    }


def export_sft(sessions: list[dict], out_path: str | Path, *, successful_only: bool = False) -> int:
    """Write an SFT JSONL dataset. Returns the number of examples written."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with out_path.open("w") as fh:
        for session in sessions:
            if successful_only and not _is_successful(session.get("outcome", {})):
                continue
            example = session_to_sft(session)
            if example is None:
                continue
            fh.write(json.dumps(example, ensure_ascii=False) + "\n")
            count += 1
    return count


def _is_successful(outcome: dict) -> bool:
    signals = [outcome.get("tests_passed"), outcome.get("pr_merged"), outcome.get("user_rating")]
    if isinstance(outcome.get("user_rating"), (int, float)):
        signals[-1] = outcome["user_rating"] >= 4
    return any(s is True for s in signals)
