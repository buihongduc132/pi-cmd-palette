---
name: pi-cmd-palette
description: >
    Fuzzy command palette for pi. Use when the user asks to list, search,
    browse, discover, find, read, inspect, or run slash commands, prompts,
    or skills. Triggers: command palette, fuzzy find command, list commands,
    browse commands, search prompts, find skill, /cmd.
---

# Pi Command Palette

A single `/cmd` slash command that surfaces LIST / READ / RUN over every
slash command, prompt, and skill in the current pi session, with fuzzy
search over name / description / body content.

## Usage

```
/cmd                     # interactive fuzzy picker
/cmd <query>             # fuzzy-filtered list (no picker)
/cmd list <query>        # explicit LIST mode
/cmd read <name>         # READ: show full detail for /<name>
/cmd run <name> [args]   # RUN: invoke /<name> with optional args
/cmd help                # this help
```

## How RUN works

RUN re-injects `/<name> <args>` as a user message, in the exact form a
human would type. This routes through pi's normal prompt/skill/command
expansion pipeline, so EVERY functionality of the underlying command is
preserved:

- argument substitution (`$1`, `$@`, `${@:N}`)
- frontmatter (`name`, `description`, `argument-hint`)
- skill loading (model-invocable + explicit)
- MCP server attachment (for skills with embedded MCP)
- extension-registered commands (runtime)

No reimplementation, no feature loss.

## Fuzzy matching

Subsequence matching with bonuses for:

- boundary chars (after `/`, `_`, `-`, `.`, ` `, `:`, `@`, or camelCase)
- consecutive matches
- leading prefix

Multi-field ranking uses the BEST field score per item (max, not sum):

- name: weight 3
- description: weight 2
- body content: weight 1

## Sources

| Source | Path | Kind tag |
|--------|------|----------|
| Global prompts | `<agentDir>/prompts/*.md` | `cmd` |
| Project prompts | `<cwd>/.pi/prompts/*.md` | `cmd` |
| Global skills | `<agentDir>/skills/*/SKILL.md` | `skill` |
| Project skills | `<cwd>/.pi/skills/*/SKILL.md` | `skill` |
| Extension commands | `pi.getCommands()` | `command` |
