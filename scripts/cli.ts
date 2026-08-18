#!/usr/bin/env node
/**
 * cli.ts — Headless CLI entry point for pi-cmd-palette.
 *
 * Exposes LIST / READ over pi prompts + skills as JSON for consumption
 * by thin clients (Hermes plugin, external tooling). No LLM, no agent
 * loop — pure disk scan + cache.
 *
 * Usage:
 *   cmd-palette list [--json]           — all items, newline-delimited or JSON array
 *   cmd-palette read <name> [--json]    — single item detail
 *   cmd-palette help                    — usage
 *
 * Cache: enabled by default (TTL 300s, configurable via CMD_PALETTE_CACHE_TTL).
 * Both pi /cmd extension and this CLI share the same cache file.
 *
 * Design notes (per findings turn 10):
 *   - discovery.ts is already pure (no pi imports) — reuse directly
 *   - RUN subaction omitted (requires pi.sendUserMessage, not available headless)
 *   - Runtime commands (pi.getCommands()) omitted (pi-only, no disk source)
 *   - Skills coverage: yes (discoverSkills from disk + project-local)
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
  discoverPrompts,
  discoverSkills,
  sortByName,
  type PaletteItem,
} from "../extensions/discovery.ts";
import { formatRead } from "../extensions/format.ts";
import { getCachedOrRescan } from "./cache.ts";

/** Resolve agent config dir (PI_CODING_AGENT_DIR or ~/.pi/agent). */
function agentDir(): string {
  const env = process.env.PI_CODING_AGENT_DIR;
  if (env) return env;
  return join(homedir(), ".pi", "agent");
}

/** Gather all items from disk (cached). */
function gatherItems(cwd: string): PaletteItem[] {
  const dir = agentDir();
  const dirs = [
    join(dir, "prompts"),
    join(dir, "skills"),
    join(cwd, ".pi", "prompts"),
    join(cwd, ".pi", "skills"),
  ];

  return getCachedOrRescan(dir, cwd, dirs, () => {
    // Rescan callback — disk discovery only (no pi.getCommands).
    const fromDisk = [
      ...discoverPrompts(join(dir, "prompts")),
      ...discoverSkills(join(dir, "skills")),
    ];
    const projectPrompts = discoverPrompts(join(cwd, ".pi", "prompts"));
    const projectSkills = discoverSkills(join(cwd, ".pi", "skills"));
    return sortByName([...fromDisk, ...projectPrompts, ...projectSkills]);
  });
}

/** Resolve an item by name (case-insensitive, leading-slash tolerant). */
function findItemByName(
  items: PaletteItem[],
  name: string,
): PaletteItem | undefined {
  const lower = name.toLowerCase().replace(/^\//, "");
  return items.find((i) => i.name.toLowerCase() === lower);
}

/** Main CLI dispatcher. */
function main() {
  const args = process.argv.slice(2);
  const subaction = args[0]?.toLowerCase();
  const cwd = process.cwd();

  if (!subaction || subaction === "help" || subaction === "--help") {
    console.log([
      "pi-cmd-palette CLI — headless list/read over prompts + skills",
      "",
      "Usage:",
      "  cmd-palette list [--json]        — list all items (default: newline text)",
      "  cmd-palette read <name> [--json] — read single item detail",
      "  cmd-palette help                 — this usage",
      "",
      "Environment:",
      "  CMD_PALETTE_CACHE_TTL  — cache TTL in seconds (default 300, 0=disabled)",
      "  PI_CODING_AGENT_DIR    — agent config root (default ~/.pi/agent)",
    ].join("\n"));
    process.exit(0);
  }

  if (subaction === "list") {
    const items = gatherItems(cwd);
    const useJson = args.includes("--json");

    if (useJson) {
      // JSON array output (for programmatic consumption).
      console.log(JSON.stringify(items, null, 2));
    } else {
      // Newline-delimited text output (for grep / awk).
      for (const item of items) {
        const prefix = item.kind === "skill" ? "/skill:" : "/";
        const desc = item.description ? ` — ${item.description}` : "";
        console.log(`[${item.kind}] ${prefix}${item.name}${desc}`);
      }
    }
    process.exit(0);
  }

  if (subaction === "read") {
    const name = args[1];
    if (!name) {
      console.error("Usage: cmd-palette read <name> [--json]");
      process.exit(1);
    }

    const items = gatherItems(cwd);
    const item = findItemByName(items, name);
    if (!item) {
      console.error(`No command named ${name.replace(/^\//, "")}`);
      process.exit(1);
    }

    const useJson = args.includes("--json");
    if (useJson) {
      console.log(JSON.stringify(item, null, 2));
    } else {
      console.log(formatRead(item));
    }
    process.exit(0);
  }

  console.error(`Unknown subaction: ${subaction}`);
  console.error("Run 'cmd-palette help' for usage.");
  process.exit(1);
}

main();
