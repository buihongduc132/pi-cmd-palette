# pi-cmd-palette

> Fuzzy command palette for [pi](https://github.com/mariozechner/pi-coding-agent).
> List, read, and run every slash command, prompt, and skill — with fuzzy
> search over name, description, and body content.

## Install

In your pi profile (`~/.pi/agent/settings.json`):

```jsonc
{
  "packages": [
    "https://github.com/buihongduc132/pi-cmd-palette"
  ]
}
```

Then `pi install` and restart pi. The `/cmd` command becomes available.

## Usage

```
/cmd                     # interactive fuzzy picker
/cmd <query>             # fuzzy-filtered list (no picker)
/cmd list <query>        # explicit LIST mode
/cmd read <name>         # READ: show full detail for /<name>
/cmd run <name> [args]   # RUN: invoke /<name> with optional args
/cmd help                # usage help
```

### Examples

```
/cmd deploy              # fuzzy-find every command mentioning "deploy"
/cmd read 50-opsx-archive # inspect a command before running it
/cmd run 20-ospx-new my-change   # invoke /20-ospx-new with an argument
```

## Tool — `cmd_palette`

In addition to the `/cmd` slash command (TUI-only), pi-cmd-palette registers
a **tool** named `cmd_palette` that sub-agents and LLM tool calls can invoke
directly. This is the programmatic entry point — no TUI picker, returns text.

### Parameters

| Parameter   | Type                                          | Required | Description                          |
|-------------|-----------------------------------------------|----------|--------------------------------------|
| `subaction` | `"list" \| "read" \| "run" \| "help"`         | yes      | Action to perform                    |
| `query`     | `string`                                      | no       | Fuzzy search query (for `list`)      |
| `name`      | `string`                                      | no       | Command/skill name (for `read`/`run`)|
| `args`      | `string`                                      | no       | Arguments to pass (for `run`)        |

### Examples

```
cmd_palette({ subaction: "list", query: "deploy" })   → text list of matching commands
cmd_palette({ subaction: "read", name: "50-opsx-archive" }) → full detail text
cmd_palette({ subaction: "run", name: "deploy", args: "prod" }) → invokes /deploy prod
cmd_palette({ subaction: "help" })                     → usage text
```

### Design

The tool reuses the same pure dispatch logic as `/cmd` via `dispatchForTool()`
in `dispatch.ts`. No code duplication — the tool is a thin wrapper that maps
structured parameters to the args string format and captures the text result.

## How RUN preserves functionality

`/cmd run <name> <args>` re-injects `/<name> <args>` as a user message —
in the exact form a human would type. This routes through pi's normal
prompt/skill/command expansion pipeline, preserving every feature of the
underlying command:

- argument substitution (`$1`, `$@`, `${@:N}`)
- frontmatter (`name`, `description`, `argument-hint`)
- skill loading (model-invocable + explicit)
- MCP server attachment (for skills with embedded MCP config)
- extension-registered commands (runtime, via `pi.getCommands()`)

No reimplementation, no feature loss.

## Fuzzy matching

Subsequence matching with bonuses for:

- boundary characters (after `/`, `_`, `-`, `.`, ` `, `:`, `@`, or camelCase)
- consecutive character matches
- leading prefix matches

Multi-field ranking uses the **best** field score per item (max, not sum):

| Field   | Weight |
|---------|--------|
| name    | 3      |
| description | 2  |
| body content | 1 |

## Sources

The palette aggregates from:

| Source              | Path                              | Kind tag   |
|---------------------|-----------------------------------|------------|
| Global prompts      | `<agentDir>/prompts/*.md`         | `cmd`      |
| Project prompts     | `<cwd>/.pi/prompts/*.md`          | `cmd`      |
| Global skills       | `<agentDir>/skills/*/SKILL.md`    | `skill`    |
| Project skills      | `<cwd>/.pi/skills/*/SKILL.md`     | `skill`    |
| Extension commands  | `pi.getCommands()`                | `command`  |

## Development

```bash
npm install
npm run check         # typecheck + coverage
npm run smoke-test    # load + pure-helper checks
```

### Layout

```
extensions/
├── fuzzy.ts          # pure fuzzy-search helpers
├── discovery.ts      # pure disk + runtime discovery
├── format.ts         # pure output formatting
├── dispatch.ts       # pure subaction dispatcher (the feature logic) + dispatchForTool (tool path)
├── index.ts          # pi extension entry point — thin wrapper: /cmd command + cmd_palette tool
└── *.test.ts         # co-located vitest tests (incl. dispatch.test.ts)
skills/pi-cmd-palette/SKILL.md   # pi skill descriptor
scripts/smoke-test.ts            # load + sanity checks
```

The dispatch logic (subaction routing, picker flow, RUN re-injection) lives
in `dispatch.ts` and is fully unit-tested via `dispatch.test.ts` with fake
UI/runner deps. `index.ts` is a thin wiring layer that builds real deps
from the ExtensionAPI — per pi-package convention it's excluded from
coverage (untestable without a pi runtime); see `dispatch.ts` instead.

## License

MIT
