/**
 * dispatch.ts — Pure subaction dispatcher (no pi imports, fully testable).
 *
 * The `/cmd` slash command has multiple subactions (help, read, run, list,
 * default fuzzy list, interactive picker). This module factors that dispatch
 * logic out of index.ts into a pure function that takes injectable
 * dependencies (item source, UI, runner). That way the entire feature can
 * be unit-tested without spinning up a pi runtime.
 *
 * index.ts becomes a thin wrapper that:
 *   1. builds the real Deps from the ExtensionAPI
 *   2. calls dispatch()
 */

import type { PaletteItem } from "./discovery.ts";
import { formatHelp, formatList, formatRead, selectLabel } from "./format.ts";
import { fuzzyRankMulti, type MultiField } from "./fuzzy.ts";

/** Result of a dispatch call — what should happen next. */
export type DispatchOutcome =
  | { kind: "notified"; message: string; level: "info" | "warning" | "error" }
  | { kind: "ran"; invocation: string }
  | { kind: "cancelled" }
  | { kind: "picked-read"; name: string }
  | { kind: "picker-skipped-no-ui"; message: string };

/** Injectable UI surface — tests pass fakes, prod passes ctx.ui. */
export interface DispatchUi {
  /** Show a notification. */
  notify(message: string, level?: "info" | "warning" | "error"): void;
  /** Text input. Returns undefined on cancel. */
  input(title: string, placeholder?: string): Promise<string | undefined>;
  /** Selector. Returns undefined on cancel. */
  select(title: string, options: string[]): Promise<string | undefined>;
}

/** Injectable runner — tests pass a spy, prod passes pi.sendUserMessage. */
export interface DispatchRunner {
  /** Re-inject `invocation` (e.g. `/deploy prod`) as a user message. */
  run(invocation: string): void;
}

/** All deps the dispatcher needs. */
export interface DispatchDeps {
  /** Whether interactive UI is available (false in print/RPC mode). */
  hasUI: boolean;
  /** Source of palette items (disk + runtime). */
  getItems(): PaletteItem[];
  /** UI surface (only called when hasUI = true for picker flows). */
  ui: DispatchUi;
  /** RUNNER — re-injects slash command as user message. */
  runner: DispatchRunner;
}

/** Search items by fuzzy query over name + description + content. */
export function searchItems(items: PaletteItem[], query: string): PaletteItem[] {
  if (!query.trim()) return items;
  const fields: MultiField<PaletteItem>[] = [
    { text: (i) => i.name, weight: 3 },
    { text: (i) => i.description, weight: 2 },
    { text: (i) => i.content, weight: 1 },
  ];
  return fuzzyRankMulti(query, items, fields).map((s) => s.item);
}

/** Find an exact item by name (case-insensitive, leading-slash tolerant). */
export function findItemByName(
  items: PaletteItem[],
  name: string,
): PaletteItem | undefined {
  const lower = name.toLowerCase().replace(/^\//, "");
  return items.find((i) => i.name.toLowerCase() === lower);
}

/** Strip a leading slash from a token, if present. */
export function normalizeName(token: string): string {
  return token.replace(/^\//, "");
}

/**
 * Build the canonical pi invocation string for an item.
 *
 * pi has different expansion rules per kind:
 *   - prompt-sourced commands expand via bare name:     `/<name> <args>`
 *   - skills expand ONLY when prefixed with `skill:`:    `/skill:<name> <args>`
 *   - extension-registered commands use bare name:       `/<name> <args>`
 *
 * Without the `skill:` prefix, pi sends the text verbatim to the LLM and
 * never loads the skill body (agent-session.js:844 — `if (!text.startsWith("/skill:")) return text;`).
 * So for skill-kind items we MUST inject `/skill:<name> <args>`.
 *
 * NOTE: pi also registers every skill as a runtime command named
 * `skill:<name>`. When that runtime command reaches us via
 * pi.getCommands(), findItemByName() will look up the bare user-typed name
 * against `skill:<name>` — see resolveItemForRun() for the matching layer.
 */
export function buildInvocation(item: PaletteItem, args: string): string {
  const trimmed = args.trim();
  const prefix = item.kind === "skill" ? "/skill:" : "/";
  return trimmed ? `${prefix}${item.name} ${trimmed}` : `${prefix}${item.name}`;
}

/**
 * Resolve a user-typed name to a palette item for RUN, handling the
 * `skill:<name>` ↔ bare-name ambiguity.
 *
 * pi registers every skill BOTH as a disk entry (bare name, kind=skill)
 * AND as a runtime twin named `skill:<name>` (kind=command). We always
 * prefer the disk skill entry (carries inline content for READ).
 *
 * Lookup order:
 *   1. If query is `skill:<bare>` → return the matching disk skill if any
 *   2. exact match on bare name (covers prompts, extension commands,
 *      and disk skills when user typed the bare name)
 *   3. as a last resort, match a runtime `skill:<bare>` twin back to its
 *      disk skill
 */
export function resolveItemForRun(
  items: PaletteItem[],
  query: string,
): PaletteItem | undefined {
  const lower = normalizeName(query).toLowerCase();

  // 1. user typed `skill:<name>` — prefer the disk skill over the runtime twin
  if (lower.startsWith("skill:")) {
    const bare = lower.slice("skill:".length);
    const diskSkill = items.find(
      (i) => i.kind === "skill" && i.name.toLowerCase() === bare,
    );
    if (diskSkill) return diskSkill;
    // No disk skill — fall through to exact-name match (catches the runtime
    // twin or any other item literally named `skill:<name>`).
    const exact = items.find((i) => i.name.toLowerCase() === lower);
    if (exact) return exact;
  }

  // 2. exact bare-name match (prompts, commands, disk skills)
  const exactHit = items.find((i) => i.name.toLowerCase() === lower);
  if (exactHit) return exactHit;

  // 3. user typed bare name; only a `skill:<name>` runtime twin exists —
  //    map it back to a disk skill of the same bare name if present.
  const twinSkill = items.find(
    (i) => i.kind === "skill" && `skill:${i.name.toLowerCase()}` === lower,
  );
  return twinSkill;
}

/**
 * Core dispatcher. Parses `args` (the raw string after `/cmd `) and routes
 * to the appropriate subaction. Pure: no I/O except through deps.
 *
 * Subactions:
 *   help | ?            → notify with help text
 *   read <name>         → notify with full item detail
 *   run <name> [args]   → runner.run(`/<name> <args>`)
 *   list [query]        → notify with filtered list
 *   <query>             → notify with fuzzy-filtered list (default)
 *   (empty)             → interactive picker (or fallback notify if !hasUI)
 */
export async function dispatch(
  args: string,
  deps: DispatchDeps,
): Promise<DispatchOutcome> {
  const trimmed = args.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const subaction = tokens[0]?.toLowerCase();
  const items = deps.getItems();

  // /cmd help
  if (subaction === "help" || subaction === "?") {
    const message = formatHelp();
    deps.ui.notify(message, "info");
    return { kind: "notified", message, level: "info" };
  }

  // /cmd read <name>
  if (subaction === "read") {
    const rawName = tokens[1];
    if (!rawName) {
      const message = "Usage: /cmd read <name>";
      deps.ui.notify(message, "warning");
      return { kind: "notified", message, level: "warning" };
    }
    const item = resolveItemForRun(items, normalizeName(rawName));
    if (!item) {
      const message = `No command named ${normalizeName(rawName)}`;
      deps.ui.notify(message, "warning");
      return { kind: "notified", message, level: "warning" };
    }
    const message = formatRead(item);
    deps.ui.notify(message, "info");
    return { kind: "notified", message, level: "info" };
  }

  // /cmd run <name> [args...]
  if (subaction === "run") {
    const rawName = tokens[1];
    if (!rawName) {
      const message = "Usage: /cmd run <name> [args]";
      deps.ui.notify(message, "warning");
      return { kind: "notified", message, level: "warning" };
    }
    const cleanName = normalizeName(rawName);
    const item = resolveItemForRun(items, cleanName);
    if (!item) {
      const message = `No command named ${cleanName}`;
      deps.ui.notify(message, "warning");
      return { kind: "notified", message, level: "warning" };
    }
    const rest = tokens.slice(2).join(" ");
    const invocation = buildInvocation(item, rest);
    deps.runner.run(invocation);
    return { kind: "ran", invocation };
  }

  // /cmd list [query...]
  if (subaction === "list") {
    const query = tokens.slice(1).join(" ");
    const results = searchItems(items, query);
    const message = `${formatList(results)}\n\n${results.length} match(es)${query ? ` for "${query}"` : ""}`;
    deps.ui.notify(message, "info");
    return { kind: "notified", message, level: "info" };
  }

  // /cmd <query>  (no subaction → fuzzy list)
  if (trimmed) {
    const results = searchItems(items, trimmed);
    if (results.length === 0) {
      const message = `No matches for "${trimmed}".`;
      deps.ui.notify(message, "info");
      return { kind: "notified", message, level: "info" };
    }
    const message = `${formatList(results)}\n\n${results.length} match(es) for "${trimmed}"`;
    deps.ui.notify(message, "info");
    return { kind: "notified", message, level: "info" };
  }

  // /cmd  (no args → interactive picker, or fallback if no UI)
  if (!deps.hasUI) {
    const message = formatList(items);
    deps.ui.notify(message, "info");
    return { kind: "picker-skipped-no-ui", message };
  }

  // Interactive: ask for a query first, then pick from matches.
  const query = await deps.ui.input(
    "Command palette — type to fuzzy search (name/desc/content):",
    "<filter or enter for all>",
  );
  if (query === undefined) {
    return { kind: "cancelled" };
  }
  const results = searchItems(items, query);
  if (results.length === 0) {
    const message = `No matches${query ? ` for "${query}"` : ""}.`;
    deps.ui.notify(message, "info");
    return { kind: "notified", message, level: "info" };
  }
  const labels = results.map(selectLabel);
  const choice = await deps.ui.select(
    `Command palette (${results.length})`,
    labels,
  );
  if (choice === undefined) {
    return { kind: "cancelled" };
  }
  const idx = labels.indexOf(choice);
  if (idx < 0) {
    return { kind: "cancelled" };
  }
  const picked = results[idx];

  // Runtime extension commands (no inline content) → READ.
  // Everything else → RUN.
  if (picked.kind === "command" && !picked.content) {
    const message = formatRead(picked);
    deps.ui.notify(message, "info");
    return { kind: "picked-read", name: picked.name };
  }

  // For prompt/skill items, ask whether to pass arguments.
  const extraArgs = await deps.ui.input(
    `Arguments for /${picked.name} (optional):`,
    picked.argumentHint ?? "",
  );
  // Respect cancellation — undefined means the user escaped.
  if (extraArgs === undefined) {
    return { kind: "cancelled" };
  }
  const invocation = buildInvocation(picked, extraArgs);
  deps.runner.run(invocation);
  return { kind: "ran", invocation };
}

// ===========================================================================
// Tool invocation path — structured params → text result (no TUI)
// ===========================================================================

/** Result from dispatchForTool — text content + optional invocation for RUN. */
export interface ToolResult {
  /** Text content to return to the caller (LLM / tool result). */
  text: string;
  /** For RUN: the re-injected invocation string (e.g. `/deploy prod`). */
  invocation?: string;
}

/** Structured parameters for the tool invocation path. */
export interface ToolParams {
  subaction: "list" | "read" | "run" | "help";
  /** Fuzzy query for "list" subaction. */
  query?: string;
  /** Command/skill name for "read" and "run" subactions. */
  name?: string;
  /** Extra arguments for "run" subaction. */
  args?: string;
}

/**
 * Pure dispatcher for the tool invocation path.
 *
 * Accepts structured parameters (subaction + query/name/args) and returns
 * a text result — no TUI picker, no side effects beyond the optional runner.
 * Reuses the existing dispatch() function internally by building the
 * appropriate args string and providing a no-op UI.
 *
 * This is the bridge between the tool registration (index.ts) and the
 * core dispatch logic (dispatch()). The tool handler in index.ts maps
 * pi.n() parameters to ToolParams, calls this function, and returns
 * the text as tool content.
 */
export async function dispatchForTool(
  params: ToolParams,
  items: PaletteItem[],
  runner?: DispatchRunner,
): Promise<ToolResult> {
  // Build the args string that dispatch() expects.
  let args: string;
  switch (params.subaction) {
    case "help":
      args = "help";
      break;
    case "list":
      args = params.query ? `list ${params.query}` : "list";
      break;
    case "read":
      args = params.name ? `read ${params.name}` : "read";
      break;
    case "run":
      args = params.name
        ? params.args
          ? `run ${params.name} ${params.args}`
          : `run ${params.name}`
        : "run";
      break;
  }

  // No-op UI — dispatch() calls notify() which we capture, but never
  // calls input()/select() because hasUI=false.
  let capturedMessage = "";
  const noopUi: DispatchUi = {
    notify: (message: string) => {
      capturedMessage = message;
    },
    input: async () => undefined,
    select: async () => undefined,
  };

  const noopRunner: DispatchRunner = {
    run: () => {},
  };

  const outcome = await dispatch(args, {
    hasUI: false,
    getItems: () => items,
    ui: noopUi,
    runner: runner ?? noopRunner,
  });

  // Extract text from the outcome.
  switch (outcome.kind) {
    case "notified":
    case "picker-skipped-no-ui":
      return { text: outcome.message };
    case "ran":
      return {
        text: `Invoked: ${outcome.invocation}`,
        invocation: outcome.invocation,
      };
    case "cancelled":
      return { text: "Cancelled." };
    case "picked-read":
      return { text: `Read: ${outcome.name}` };
  }
}
