# Forage

Collect your Claude Code and Codex CLI coding sessions, scrub secrets, and
turn them into training-ready datasets.

## Pipeline

```
~/.claude/projects/**.jsonl ─┐
                             ├─→ parse → unified schema → scrub → ~/.forage/sessions/*.json → SFT JSONL
~/.codex/sessions/**.jsonl  ─┘
```

## Usage

```bash
# Scan both agents' session logs, normalize + scrub, store locally
python -m forage collect

# Summary of what's in the store
python -m forage stats

# Export a Hugging Face TRL / Axolotl-compatible chat dataset
python -m forage export --out forage_sft.jsonl [--successful-only]
```

`collect` accepts `--claude-dir`, `--codex-dir`, and `--store` overrides —
see `examples/` for fixture sessions in both source formats.

## Modules

- `schema.py` — unified `Session`/`Turn` dataclasses
- `parsers/claude_code.py` — Claude Code transcript JSONL parser
- `parsers/codex.py` — Codex CLI rollout JSONL parser
- `scrub.py` — secret/PII redaction (known formats + entropy detection)
- `collector.py` — discovery, normalization, storage
- `export.py` — SFT chat-format exporter (tool calls preserved)

## Notes

- Sessions are scrubbed **before** they touch the store; emails become
  `[EMAIL]`, secrets become `[REDACTED]`, git SHAs are kept.
- Outcome labels (`tests_passed`, `pr_merged`, `user_rating`) live in each
  stored session's `outcome` field; `--successful-only` filters on them.
- Fine-tuning targets are open models (Claude has no weight-level
  fine-tuning); the same corpus also works for retrieval and evals.

## Tests

```bash
python -m pytest tests/
```
