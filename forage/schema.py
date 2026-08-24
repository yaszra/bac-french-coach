"""Unified session schema shared by all Forage parsers and exporters."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional


@dataclass
class Turn:
    role: str  # "user" | "assistant" | "tool"
    content: str = ""
    tool_name: Optional[str] = None
    tool_input: Optional[dict] = None
    tool_result: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v not in (None, "")} | {
            "role": self.role,
            "content": self.content,
        }


@dataclass
class Session:
    session_id: str
    source: str  # "claude-code" | "codex"
    repo: Optional[str] = None
    started_at: Optional[str] = None
    turns: list[Turn] = field(default_factory=list)
    outcome: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "source": self.source,
            "repo": self.repo,
            "started_at": self.started_at,
            "turns": [t.to_dict() for t in self.turns],
            "outcome": self.outcome,
        }

    @property
    def turn_count(self) -> int:
        return len(self.turns)

    @property
    def tool_call_count(self) -> int:
        return sum(1 for t in self.turns if t.tool_name)
