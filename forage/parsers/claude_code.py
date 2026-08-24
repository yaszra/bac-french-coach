"""Parser for Claude Code session transcripts.

Claude Code writes one JSONL file per session under
``~/.claude/projects/<project-slug>/<session-id>.jsonl``. Each line is an
event with a ``type`` ("user", "assistant", ...) and a ``message`` payload
in Anthropic Messages API shape (content blocks: text, tool_use, tool_result).
"""

from __future__ import annotations

import json
from pathlib import Path

from ..schema import Session, Turn

SOURCE = "claude-code"


def parse_file(path: str | Path) -> Session:
    path = Path(path)
    session = Session(session_id=path.stem, source=SOURCE)
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        _apply_event(session, event)
    return session


def _apply_event(session: Session, event: dict) -> None:
    etype = event.get("type")
    if session.started_at is None and event.get("timestamp"):
        session.started_at = event["timestamp"]
    if session.repo is None and event.get("cwd"):
        session.repo = Path(event["cwd"]).name

    message = event.get("message") or {}
    content = message.get("content")

    if etype == "user":
        if isinstance(content, str):
            session.turns.append(Turn(role="user", content=content))
        elif isinstance(content, list):
            for block in content:
                if block.get("type") == "text":
                    session.turns.append(Turn(role="user", content=block.get("text", "")))
                elif block.get("type") == "tool_result":
                    session.turns.append(
                        Turn(role="tool", tool_result=_result_text(block.get("content")))
                    )
    elif etype == "assistant" and isinstance(content, list):
        for block in content:
            if block.get("type") == "text":
                session.turns.append(Turn(role="assistant", content=block.get("text", "")))
            elif block.get("type") == "tool_use":
                session.turns.append(
                    Turn(
                        role="assistant",
                        tool_name=block.get("name"),
                        tool_input=block.get("input"),
                    )
                )


def _result_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict))
    return ""
