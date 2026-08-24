"""Parser for OpenAI Codex CLI session rollouts.

Codex CLI persists sessions as JSONL under ``~/.codex/sessions/``. Lines are
either a session meta record or response items: ``message`` (with role and
content parts), ``function_call`` and ``function_call_output``.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..schema import Session, Turn

SOURCE = "codex"


def parse_file(path: str | Path) -> Session:
    path = Path(path)
    session = Session(session_id=path.stem, source=SOURCE)
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        _apply_item(session, item)
    return session


def _apply_item(session: Session, item: dict) -> None:
    # Session meta record (first line in newer rollout formats).
    payload = item.get("payload") if item.get("type") == "session_meta" else None
    if payload:
        session.session_id = payload.get("id", session.session_id)
        session.started_at = payload.get("timestamp") or session.started_at
        if payload.get("cwd"):
            session.repo = Path(payload["cwd"]).name
        return

    # Response items may be nested under "payload" or at top level.
    rec = item.get("payload", item)
    rtype = rec.get("type")

    if rtype == "message":
        role = rec.get("role", "user")
        text = _content_text(rec.get("content"))
        if text:
            session.turns.append(Turn(role="assistant" if role == "assistant" else "user", content=text))
    elif rtype == "function_call":
        args = rec.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {"raw": args}
        session.turns.append(Turn(role="assistant", tool_name=rec.get("name"), tool_input=args))
    elif rtype == "function_call_output":
        output = rec.get("output")
        if isinstance(output, dict):
            output = output.get("output", json.dumps(output))
        session.turns.append(Turn(role="tool", tool_result=str(output or "")))


def _content_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") in ("input_text", "output_text", "text")
        )
    return ""
