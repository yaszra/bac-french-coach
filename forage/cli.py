"""Forage CLI.

Usage:
    python -m forage collect [--claude-dir DIR] [--codex-dir DIR] [--store DIR]
    python -m forage export --out PATH [--store DIR] [--successful-only]
    python -m forage stats [--store DIR]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import collector, export


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="forage", description="Train models from your Claude Code and Codex sessions.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_collect = sub.add_parser("collect", help="Scan agent session logs, normalize, scrub, and store them.")
    p_collect.add_argument("--claude-dir", type=Path, default=collector.DEFAULT_CLAUDE_DIR)
    p_collect.add_argument("--codex-dir", type=Path, default=collector.DEFAULT_CODEX_DIR)
    p_collect.add_argument("--store", type=Path, default=collector.DEFAULT_STORE)
    p_collect.add_argument("--min-turns", type=int, default=2)

    p_export = sub.add_parser("export", help="Export the store as an SFT chat dataset (JSONL).")
    p_export.add_argument("--store", type=Path, default=collector.DEFAULT_STORE)
    p_export.add_argument("--out", type=Path, required=True)
    p_export.add_argument("--successful-only", action="store_true")

    p_stats = sub.add_parser("stats", help="Print summary stats for the store as JSON.")
    p_stats.add_argument("--store", type=Path, default=collector.DEFAULT_STORE)

    args = parser.parse_args(argv)

    if args.command == "collect":
        sessions = collector.collect(args.claude_dir, args.codex_dir, args.store, args.min_turns)
        by_source: dict[str, int] = {}
        for s in sessions:
            by_source[s.source] = by_source.get(s.source, 0) + 1
        print(f"Collected {len(sessions)} session(s) into {args.store} {by_source}")
    elif args.command == "export":
        sessions = collector.load_store(args.store)
        count = export.export_sft(sessions, args.out, successful_only=args.successful_only)
        print(f"Wrote {count} SFT example(s) to {args.out}")
    elif args.command == "stats":
        sessions = collector.load_store(args.store)
        stats = {
            "sessions": len(sessions),
            "by_source": {},
            "total_turns": 0,
            "total_tool_calls": 0,
        }
        for s in sessions:
            stats["by_source"][s["source"]] = stats["by_source"].get(s["source"], 0) + 1
            stats["total_turns"] += len(s.get("turns", []))
            stats["total_tool_calls"] += sum(1 for t in s.get("turns", []) if t.get("tool_name"))
        print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
