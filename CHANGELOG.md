# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-07-21

### Added
- Initial release.
- `/cmd` slash command with LIST / READ / RUN modes.
- Fuzzy subsequence search over name, description, and body content.
  Multi-field ranking with weights (name 3x, description 2x, content 1x),
  best-field-wins per item.
- Disk discovery of prompts (`<agentDir>/prompts/`, `<cwd>/.pi/prompts/`)
  and skills (`<agentDir>/skills/`, `<cwd>/.pi/skills/`), matching pi's
  own loader semantics.
- Runtime-registered extension commands merged in via `pi.getCommands()`.
- RUN preserves every underlying command feature by re-injecting
  `/<name> <args>` as a user message — routes through pi's normal
  prompt/skill/command pipeline. No reimplementation.
- Interactive picker (`ctx.ui.input` + `ctx.ui.select`) with optional
  argument prompt before RUN.
- Pure-helper test suite (fuzzy, discovery, format) with 85%+ coverage
  thresholds.
- CI workflow (typecheck + coverage + smoke-test + `npm pack --dry-run`).
