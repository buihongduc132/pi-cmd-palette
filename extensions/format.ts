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

/** Options for paged / showAll list rendering. */
export interface FormatListOptions {
  /** Page number, 1-indexed. Default 1. Ignored if showAll=true. */
  page?: number;
  /** Items per page. Default 50. Ignored if showAll=true. */
  pageSize?: number;
  /** Show all items (no paging). Default false. */
  showAll?: boolean;
  /** Footer appears when total > this even in showAll mode. Default 200. */
  footerThreshold?: number;
}

/** Render one item as a numbered line (page-local numbering). */
function formatLine(item: PaletteItem, localIndex: number): string {
  const tag = item.kind === "prompt" ? "cmd" : item.kind;
  const desc = item.description ? ` — ${item.description}` : "";
  const num = String(localIndex + 1).padStart(3, " ");
  return `${num}. [${tag}] ${invocationPrefix(item)}${item.name}${desc}`;
}

/**
 * Compact LIST view — one line per item.
 *
 * Two modes:
 *   1. Legacy: `formatList(items, maxItems:number)` — caps output at maxItems
 *      with old "... (X more, refine query)" footer. Backward-compat.
 *   2. New: `formatList(items, FormatListOptions)` — paged or showAll.
 *      - showAll=true: render every item. Footer "Showing all N" if N > footerThreshold (default 200).
 *      - paged: slice [start, end), footer "Showing X-Y of Z (W more — page N+1 or refine)"
 *        or just "Showing X-Y of Z" on last page. No footer when total ≤ pageSize.
 */
export function formatList(
  items: PaletteItem[],
  opts?: FormatListOptions | number,
): string {
  if (items.length === 0) return "No commands found.";

  // Legacy path: numeric second arg = maxItems cap with old footer text.
  if (typeof opts === "number") {
    const maxItems = opts;
    const shown = items.slice(0, maxItems);
    const lines = shown.map((item, i) => formatLine(item, i));
    const truncated =
      items.length > maxItems ? `\n... (${items.length - maxItems} more, refine query)` : "";
    return lines.join("\n") + truncated;
  }

  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const showAll = opts?.showAll ?? false;
  const footerThreshold = opts?.footerThreshold ?? 200;

  // showAll: render every item, optional count footer above threshold.
  if (showAll) {
    const lines = items.map((item, i) => formatLine(item, i));
    const footer =
      items.length > footerThreshold ? `\nShowing all ${items.length}` : "";
    return lines.join("\n") + footer;
  }

  // Paged.
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), lastPage);
  const start = (clampedPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const slice = items.slice(start, end);
  const lines = slice.map((item, i) => formatLine(item, i));

  let footer = "";
  if (total > pageSize) {
    const more = total - end;
    if (more > 0) {
      footer = `\nShowing ${start + 1}-${end} of ${total} (${more} more — page ${clampedPage + 1} or refine)`;
    } else {
      footer = `\nShowing ${start + 1}-${end} of ${total}`;
    }
  }
  return lines.join("\n") + footer;
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
