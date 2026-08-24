"""Secret and PII scrubbing applied to every session before storage.

Combines known-format secret patterns with a generic high-entropy token
detector, so novel key formats still get caught.
"""

from __future__ import annotations

import math
import re

REDACTED = "[REDACTED]"

# Known secret formats. Order matters: specific before generic.
_PATTERNS: list[re.Pattern] = [
    re.compile(r"sk-ant-[A-Za-z0-9_-]{10,}"),          # Anthropic API keys
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),               # OpenAI-style keys
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),          # GitHub tokens
    re.compile(r"AKIA[0-9A-Z]{16}"),                    # AWS access key ids
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),        # Slack tokens
    re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),  # JWTs
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
    re.compile(  # key=value style assignments for sensitive names
        r"(?i)\b(api[_-]?key|secret|token|password|passwd)\b(\s*[:=]\s*)(['\"]?)[^\s'\"]{8,}\3"
    ),
]

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Candidate high-entropy tokens: long, no spaces, mixed alphabet.
_ENTROPY_CANDIDATE = re.compile(r"\b[A-Za-z0-9+/_=-]{32,}\b")


def _shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    counts: dict[str, int] = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    return -sum((c / len(s)) * math.log2(c / len(s)) for c in counts.values())


def scrub_text(text: str, *, scrub_emails: bool = True) -> str:
    for pat in _PATTERNS:
        if pat.groups:
            text = pat.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", text)
        else:
            text = pat.sub(REDACTED, text)
    if scrub_emails:
        text = _EMAIL.sub("[EMAIL]", text)

    def _maybe_redact(m: re.Match) -> str:
        token = m.group(0)
        # Skip hex-only git SHAs (40/64 chars) — useful, low risk.
        if re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", token):
            return token
        return REDACTED if _shannon_entropy(token) > 4.2 else token

    return _ENTROPY_CANDIDATE.sub(_maybe_redact, text)


def scrub_obj(obj):
    """Recursively scrub strings inside dicts/lists."""
    if isinstance(obj, str):
        return scrub_text(obj)
    if isinstance(obj, dict):
        return {k: scrub_obj(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [scrub_obj(v) for v in obj]
    return obj
