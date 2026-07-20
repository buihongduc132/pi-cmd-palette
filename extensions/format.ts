/**
 * format.ts — Pure formatting helpers (no pi imports, fully testable).
 *
 * Renders palette items for: list output, single-item READ view, and
 * short one-line summaries for use inside the TUI select dialog.
 */

import type { PaletteItem } from "./discovery.ts";

/**
 * The canonical slash-invocation form for an item. Skills need the
 * `skill:` prefix (pi only expands `/skill:<name>`); prompts and commands
 * use a bare `/<name>`.
 */
export function invocationPrefix(item: PaletteItem): string {
  return item.kind === "skill" ? "/skill:" : "/";
}

/** One-line label suitable for the TUI select dialog. */
export function selectLabel(item: PaletteItem): string {
  const tag = item.kind === "prompt" ? "cmd" : item.kind;
  const desc = item.description ? ` — ${item.description}` : "";
  return `${invocationPrefix(item)}${item.name}  [${tag}]${desc}`;
}

/**
 * Compact LIST view — one line per item.
 * Caps output length to keep the message digestible in the TUI.
 *
 * Each line shows the canonical invocation form (`/<name>` or `/skill:<name>`)
 * so users can copy-paste the line directly into pi and have it expand.
 */
export function formatList(items: PaletteItem[], maxItems = 200): string {
  if (items.length === 0) return "No commands found.";
  const shown = items.slice(0, maxItems);
  const lines = shown.map((item, i) => {
    const tag = item.kind === "prompt" ? "cmd" : item.kind;
    const desc = item.description ? ` — ${item.description}` : "";
    const num = String(i + 1).padStart(3, " ");
    return `${num}. [${tag}] ${invocationPrefix(item)}${item.name}${desc}`;
  });
  const truncated =
    items.length > maxItems ? `\n... (${items.length - maxItems} more, refine query)` : "";
  return lines.join("\n") + truncated;
}

/**
 * READ view — full detail for a single command.
 * Shows the name, description, kind, argument hint (if any), source path,
 * and a preview of the body content (truncated to keep things readable).
 */
export function formatRead(item: PaletteItem, maxBody = 2000): string {
  const lines: string[] = [];
  // Canonical invocation form so users can copy-paste and have it expand.
  lines.push(`${invocationPrefix(item)}${item.name}`);
  if (item.description) lines.push(`Description: ${item.description}`);
  lines.push(`Kind: ${item.kind}`);
  if (item.argumentHint) lines.push(`Arguments: ${item.argumentHint}`);
  if (item.filePath) lines.push(`Source: ${item.filePath}`);
  lines.push("");
  if (item.content) {
    const body =
      item.content.length > maxBody
        ? `${item.content.slice(0, maxBody)}\n... (truncated, ${item.content.length - maxBody} chars omitted)`
        : item.content;
    lines.push(body);
  } else if (item.kind === "command") {
    lines.push("(no inline content — this command is registered by an extension at runtime)");
  }
  return lines.join("\n");
}

/** Build the help/usage string for the palette command. */
export function formatHelp(): string {
  return [
    "pi-cmd-palette — fuzzy command palette",
    "",
    "Usage:",
    "  /cmd                    — interactive fuzzy picker over all commands",
    "  /cmd <query>            — fuzzy-filtered list (no picker, prints matches)",
    "  /cmd list <query>       — same as above, explicit LIST mode",
    "  /cmd read <name>        — READ: show full detail for /<name>",
    "  /cmd run <name> [args]  — RUN: invoke /<name> with optional args",
    "  /cmd help               — this help",
    "",
    "Fuzzy search covers: name, description, and body content.",
    "When interactive, pick an entry → it is RUN (for prompts/skills) or",
    "READ (for runtime extension commands without inline content).",
  ].join("\n");
}
