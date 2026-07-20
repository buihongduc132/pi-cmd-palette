/**
 * index.ts — pi-cmd-palette extension entry point.
 *
 * Registers a single `/cmd` slash command that surfaces LIST / READ / RUN
 * over every slash command, prompt, and skill in the current pi session,
 * with fuzzy search over name / description / body content.
 *
 * Design (per pi-tools-vs-cmd skill):
 *   - LIST/READ/RUN is a human-facing, interactive flow → COMMAND, not a tool.
 *   - Single command multiplexed by subaction (`list` | `read` | `run` | none).
 *   - RUN persists every functionality of the underlying command by literally
 *     re-injecting `/<name> <args>` as a user message — pi expands it through
 *     its normal prompt/skill/command pipeline. No reimplementation.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import {
  discoverPrompts,
  discoverSkills,
  mergeWithRuntimeCommands,
  sortByName,
  type PaletteItem,
} from "./discovery.ts";
import { fuzzyRankMulti, type MultiField } from "./fuzzy.ts";
import { formatHelp, formatList, formatRead, selectLabel } from "./format.ts";

/** Resolve the agent config dir (where prompts/ and skills/ live). */
function agentDir(ctx: { cwd: string }): string {
  // pi exposes the agent dir via PI_CODING_AGENT_DIR env (set per-stage by
  // the deploy pipeline). Fall back to the canonical ~/.pi/agent.
  const env = process.env.PI_CODING_AGENT_DIR;
  if (env) return env;
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return join(home, ".pi", "agent");
}

/** Discover every palette entry available in this session. */
function gatherItems(
  pi: ExtensionAPI,
  ctx: { cwd: string },
): PaletteItem[] {
  const dir = agentDir(ctx);

  // 1. Disk-discovered prompts + skills.
  const fromDisk = [
    ...discoverPrompts(join(dir, "prompts")),
    ...discoverSkills(join(dir, "skills")),
  ];

  // 2. Project-local prompts (cwd/.pi/prompts) — mirrors pi's own loader.
  const projectPrompts = discoverPrompts(join(ctx.cwd, ".pi", "prompts"));
  const projectSkills = discoverSkills(join(ctx.cwd, ".pi", "skills"));

  // 3. Merge with runtime-registered commands (extension commands).
  //    pi.getCommands() returns every slash command including builtin ones;
  //    we keep ones that didn't already come from disk.
  let runtimeNames: { name: string; description?: string }[] = [];
  try {
    runtimeNames = pi.getCommands().map((c) => ({
      name: c.name,
      description: c.description,
    }));
  } catch {
    runtimeNames = [];
  }

  const merged = mergeWithRuntimeCommands(
    [...fromDisk, ...projectPrompts, ...projectSkills],
    runtimeNames,
  );
  return sortByName(merged);
}

/** Fuzzy search over name + description + content. */
function search(items: PaletteItem[], query: string): PaletteItem[] {
  if (!query.trim()) return items;
  const fields: MultiField<PaletteItem>[] = [
    { text: (i) => i.name, weight: 3 },
    { text: (i) => i.description, weight: 2 },
    { text: (i) => i.content, weight: 1 },
  ];
  return fuzzyRankMulti(query, items, fields).map((s) => s.item);
}

/** Find an exact item by name (case-insensitive). */
function findExact(items: PaletteItem[], name: string): PaletteItem | undefined {
  const lower = name.toLowerCase().replace(/^\//, "");
  return items.find((i) => i.name.toLowerCase() === lower);
}

/** Strip a leading slash from a token, if present. */
function normalizeName(token: string): string {
  return token.replace(/^\//, "");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("cmd", {
    description:
      "Command palette: fuzzy list/read/run slash commands, prompts, skills. Usage: /cmd [list <query> | read <name> | run <name> [args] | <query>]",
    getArgumentCompletions: (prefix) => {
      // Cheap completion: surface a few common subaction keywords.
      const keywords = ["list", "read", "run", "help"];
      const hits = keywords
        .filter((k) => k.startsWith(prefix.toLowerCase()))
        .map((k) => ({ value: `${k} `, label: `${k}` }));
      return hits.length > 0 ? hits : null;
    },
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      const subaction = tokens[0]?.toLowerCase();

      const items = gatherItems(pi, ctx);

      // /cmd help
      if (subaction === "help" || subaction === "?") {
        ctx.ui.notify(formatHelp(), "info");
        return;
      }

      // /cmd read <name>
      if (subaction === "read") {
        const name = tokens[1];
        if (!name) {
          ctx.ui.notify("Usage: /cmd read <name>", "warning");
          return;
        }
        const item = findExact(items, normalizeName(name));
        if (!item) {
          ctx.ui.notify(`No command named /${normalizeName(name)}`, "warning");
          return;
        }
        ctx.ui.notify(formatRead(item), "info");
        return;
      }

      // /cmd run <name> [args...]
      if (subaction === "run") {
        const name = tokens[1];
        if (!name) {
          ctx.ui.notify("Usage: /cmd run <name> [args]", "warning");
          return;
        }
        const cleanName = normalizeName(name);
        const item = findExact(items, cleanName);
        if (!item) {
          ctx.ui.notify(`No command named /${cleanName}`, "warning");
          return;
        }
        const rest = tokens.slice(2).join(" ");
        await runItem(pi, ctx, item, rest);
        return;
      }

      // /cmd list [query...]
      if (subaction === "list") {
        const query = tokens.slice(1).join(" ");
        const results = search(items, query);
        ctx.ui.notify(
          `${formatList(results)}\n\n${results.length} match(es)${query ? ` for "${query}"` : ""}`,
          "info",
        );
        return;
      }

      // /cmd <query>  (no subaction → fuzzy list)
      if (trimmed) {
        const results = search(items, trimmed);
        if (results.length === 0) {
          ctx.ui.notify(`No matches for "${trimmed}".`, "info");
          return;
        }
        ctx.ui.notify(
          `${formatList(results)}\n\n${results.length} match(es) for "${trimmed}"`,
          "info",
        );
        return;
      }

      // /cmd  (no args → interactive picker)
      if (!ctx.hasUI) {
        // Non-interactive fallback: print full list.
        ctx.ui.notify(formatList(items), "info");
        return;
      }

      // Interactive: ask for a query first, then pick from matches.
      const query = await ctx.ui.input(
        "Command palette — type to fuzzy search (name/desc/content):",
        "<filter or enter for all>",
      );
      if (query === undefined) {
        return; // user cancelled
      }
      const results = search(items, query);
      if (results.length === 0) {
        ctx.ui.notify(
          `No matches${query ? ` for "${query}"` : ""}.`,
          "info",
        );
        return;
      }
      const labels = results.map(selectLabel);
      const choice = await ctx.ui.select(
        `Command palette (${results.length})`,
        labels,
      );
      if (choice === undefined) return;
      const idx = labels.indexOf(choice);
      if (idx < 0) return;
      const picked = results[idx];

      // Runtime extension commands (no inline content) → READ.
      // Everything else → RUN.
      if (picked.kind === "command" && !picked.content) {
        ctx.ui.notify(formatRead(picked), "info");
        return;
      }
      // For prompt/skill items, ask whether to pass arguments.
      const extraArgs = await ctx.ui.input(
        `Arguments for /${picked.name} (optional):`,
        picked.argumentHint ?? "",
      );
      await runItem(pi, ctx, picked, extraArgs ?? "");
    },
  });
}

/**
 * RUN an item by re-injecting it as a user message in the exact form a
 * human would type: `/<name> <args>`. This deliberately routes through
 * pi's normal expansion pipeline so EVERY functionality of the underlying
 * command — argument substitution ($1, $@, ${@:N}), frontmatter, skill
 * loading, MCP attachment, etc. — is preserved. No reimplementation.
 */
async function runItem(
  pi: ExtensionAPI,
  _ctx: unknown,
  item: PaletteItem,
  args: string,
): Promise<void> {
  const invocation = args.trim()
    ? `/${item.name} ${args.trim()}`
    : `/${item.name}`;
  // sendUserMessage is synchronous on ExtensionAPI; pi expands the slash
  // command through its prompt/skill/command resolver on the next turn.
  pi.sendUserMessage(invocation);
}
