# Telemetry — cmd READ events

> RED phase design doc. No production code yet. Tests at `extensions/telemetry.test.ts` assert this contract and currently FAIL.

## Goal

Emit an event when a command/skill/prompt is **READ** from the server
(pi-cmd-palette extension) so we can observe WHICH entries users/agents
actually inspect. The "server" here = the extension that READS command
definitions from disk + the runtime registry and renders them to the caller.

## Event schema

```ts
export interface TelemetryEvent {
  /** Discriminator. Future events: `cmd_run`, `cmd_list`, etc. */
  event: "cmd_read";
  /** Bare item name (no slash, no `skill:` prefix). */
  name: string;
  /** Item kind — matches PaletteKind. */
  kind: "command" | "prompt" | "skill";
  /** Where the definition was READ from: filePath on disk, or "runtime". */
  source: string;
  /** ISO 8601 timestamp (new Date().toISOString()). */
  at: string;
}
```

`source` derivation: `item.filePath` when non-empty, else `"runtime"` (covers
extension-registered commands + package-sourced skills with no on-disk twin).

## Emission points

| Path | Trigger | Emit? |
|------|---------|-------|
| `dispatch("read <name>")` success | item resolved + `formatRead` sent | ✅ ONE event |
| `dispatch("read <name>")` miss | `resolveItemForRun` returns undefined | ❌ no event (warning only) |
| `dispatch("read")` no name | usage warning | ❌ no event |
| `dispatchForTool({subaction:"read", name})` success | tool-path read | ✅ ONE event |
| `dispatchForTool` miss | no item | ❌ no event |

No telemetry on `list`, `run`, `help`, picker flows — out of scope for this
increment (future: `cmd_run`, `cmd_list` events).

## Where emitted (sink)

Injectable callback on `DispatchDeps`:

```ts
export interface DispatchDeps {
  hasUI: boolean;
  getItems(): PaletteItem[];
  ui: DispatchUi;
  runner: DispatchRunner;
  /** Optional telemetry sink. No-op when undefined. */
  telemetry?: (event: TelemetryEvent) => void;
}
```

`dispatchForTool` gains an optional 4th param:

```ts
export async function dispatchForTool(
  params: ToolParams,
  items: PaletteItem[],
  runner?: DispatchRunner,
  telemetry?: (event: TelemetryEvent) => void,
): Promise<ToolResult>;
```

Tool path passes its `telemetry` into the synthesized `DispatchDeps.telemetry`
so both entry points share one emission code path.

## Default sink in index.ts

`index.ts` wires `telemetry` to a default sink. Default = `console.error`
(stderr) so telemetry does not pollute stdout / tool text results.

- `ctx`/`pi` may expose a logger in the future; the sink is a single call site
  in `index.ts`, trivial to swap to a file append (`appendFileSync`) or pi
  logger later without touching `dispatch.ts`.
- Telemetry is best-effort: wrap the sink call in try/catch so a telemetry
  failure never breaks a READ (READ still notifies the user).

## Why optional + no-op default

- Existing tests / callers that don't pass `telemetry` keep working
  (backward compatible — field is optional).
- The /cmd handler in `index.ts` is the ONLY prod caller that opts in.
- Keeps `dispatch.ts` pure + testable: tests inject a recording spy.
