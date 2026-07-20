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
├── index.ts          # pi extension entry point (/cmd command)
└── *.test.ts         # co-located vitest tests
skills/pi-cmd-palette/SKILL.md   # pi skill descriptor
scripts/smoke-test.ts            # load + sanity checks
```

## License

MIT
