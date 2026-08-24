"""End-to-end tests: parse example sessions, scrub, store, export SFT."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from forage import collector, export  # noqa: E402
from forage.scrub import scrub_text, REDACTED  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"


def _collect(tmp_path):
    return collector.collect(
        claude_dir=EXAMPLES / "claude-code",
        codex_dir=EXAMPLES / "codex",
        store=tmp_path / "store",
    )


def test_collect_both_sources(tmp_path):
    sessions = _collect(tmp_path)
    assert {s.source for s in sessions} == {"claude-code", "codex"}
    claude = next(s for s in sessions if s.source == "claude-code")
    assert claude.repo == "bac-french-coach"
    assert claude.tool_call_count == 1
    codex = next(s for s in sessions if s.source == "codex")
    assert codex.session_id == "codex-demo-1"
    assert any(t.tool_name == "shell" for t in codex.turns)


def test_store_is_scrubbed(tmp_path):
    _collect(tmp_path)
    stored = collector.load_store(tmp_path / "store")
    blob = json.dumps(stored)
    assert "sk-abc12345678901234567890" not in blob
    assert REDACTED in blob


def test_scrub_patterns():
    assert scrub_text("key sk-ant-api03-abcdefghijkl here") == f"key {REDACTED} here"
    assert scrub_text("token ghp_ABCDEFGHIJKLMNOPQRSTUV") == f"token {REDACTED}"
    assert "[EMAIL]" in scrub_text("contact someone@example.com")
    # Git SHAs survive
    sha = "a" * 40
    assert sha in scrub_text(f"commit {sha}")


def test_export_sft(tmp_path):
    _collect(tmp_path)
    stored = collector.load_store(tmp_path / "store")
    out = tmp_path / "sft.jsonl"
    count = export.export_sft(stored, out)
    assert count == 2
    lines = [json.loads(l) for l in out.read_text().splitlines()]
    for ex in lines:
        roles = [m["role"] for m in ex["messages"]]
        assert "assistant" in roles and "user" in roles
        assert ex["meta"]["source"] in ("claude-code", "codex")
    # Tool calls preserved
    assert any("tool_calls" in m for ex in lines for m in ex["messages"])


def test_successful_only_filter(tmp_path):
    _collect(tmp_path)
    stored = collector.load_store(tmp_path / "store")
    stored[0]["outcome"] = {"tests_passed": True}
    out = tmp_path / "sft_ok.jsonl"
    assert export.export_sft(stored, out, successful_only=True) == 1
