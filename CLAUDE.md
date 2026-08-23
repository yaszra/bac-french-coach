# CLAUDE.md

This file provides guidance to AI assistants (such as Claude Code) working in this repository.

## Project Status

**This repository is currently empty.** As of 2026-08-23, it contains no source code, build configuration, or commit history beyond this documentation. The sections below describe the intended project and should be expanded as the codebase takes shape.

## Project Overview

`bac-french-coach` is intended to be a coaching/study application for the French Baccalauréat (French language exam preparation). No technology stack has been chosen or committed yet.

## Current State

- No package manifest (`package.json`, `pyproject.toml`, etc.)
- No build, test, or lint commands exist yet
- No CI/CD workflows configured
- No directory structure established

Do not assume any framework, language, or tooling — verify what exists in the repository before running commands.

## Guidance for AI Assistants

1. **Verify before assuming.** Since the project is in its earliest stage, check the actual files present rather than relying on this document, and keep this file updated as structure emerges.
2. **Update this file** whenever you introduce:
   - A technology stack (language, framework, package manager)
   - Build/test/lint commands
   - A directory layout
   - Coding conventions or architectural decisions
3. **Branching:** development happens on feature branches pushed to `origin`; do not commit directly to the default branch unless asked.
4. **Language context:** the product domain is French-language exam coaching. User-facing content will likely be in French; keep code identifiers and comments in English unless the repository establishes otherwise.

## Suggested Sections to Fill In Later

- **Commands** — how to install dependencies, run the dev server, run tests, lint
- **Architecture** — main modules, data flow, external services (e.g., LLM APIs, databases)
- **Conventions** — formatting, naming, state management, testing patterns
