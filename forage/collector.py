"""Collector: scans Claude Code and Codex session directories, normalizes
each session into the unified schema, scrubs secrets, and writes the result
into a local Forage store directory (one JSON file per session).
"""

from __future__ import annotations

import json
from pathlib import Path

from . import scrub
from .parsers import claude_code, codex
from .schema import Session

DEFAULT_CLAUDE_DIR = Path.home() / ".claude" / "projects"
DEFAULT_CODEX_DIR = Path.home() / ".codex" / "sessions"
DEFAULT_STORE = Path.home() / ".forage" / "sessions"


def discover(claude_dir: Path = DEFAULT_CLAUDE_DIR, codex_dir: Path = DEFAULT_CODEX_DIR):
    """Yield (parser_module, path) for every session file found."""
    if claude_dir.is_dir():
        for path in sorted(claude_dir.rglob("*.jsonl")):
            yield claude_code, path
    if codex_dir.is_dir():
        for path in sorted(codex_dir.rglob("*.jsonl")):
            yield codex, path


def collect(
    claude_dir: Path = DEFAULT_CLAUDE_DIR,
    codex_dir: Path = DEFAULT_CODEX_DIR,
    store: Path = DEFAULT_STORE,
    min_turns: int = 2,
) -> list[Session]:
    """Parse, scrub, and persist all discovered sessions. Returns them."""
    store.mkdir(parents=True, exist_ok=True)
    collected: list[Session] = []
    for parser, path in discover(claude_dir, codex_dir):
        session = parser.parse_file(path)
        if session.turn_count < min_turns:
            continue
        data = scrub.scrub_obj(session.to_dict())
        out = store / f"{session.source}-{session.session_id}.json"
        out.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        collected.append(session)
    return collected


def load_store(store: Path = DEFAULT_STORE) -> list[dict]:
    """Load all normalized (already-scrubbed) sessions from the store."""
    if not store.is_dir():
        return []
    return [json.loads(p.read_text()) for p in sorted(store.glob("*.json"))]
