/**
 * index.ts — pi-cmd-palette extension entry point.
 *
 * Registers a single `/cmd` slash command that surfaces LIST / READ / RUN
 * over every slash command, prompt, and skill in the current pi session,
 * with fuzzy search over name / description / body content.
 *
 * The actual dispatch logic lives in `./dispatch.ts` (pure, fully tested).
 * This file is a thin wrapper that wires the ExtensionAPI to the pure
 * dispatcher. Per pi-package convention, index.ts is excluded from coverage
 * (it's untestable without a pi runtime) — see dispatch.test.ts instead.
 *
 * Design (per pi-tools-vs-cmd skill):
 *   - LIST/READ/RUN is a human-facing, interactive flow → COMMAND, not a tool.
 *   - Single command multiplexed by subaction (`list` | `read` | `run` | none).
 *   - RUN persists every functionality of the underlying command by literally
 *     re-injecting `/<name> <args>` as a user message — pi expands it through
 *     its normal prompt/skill/command pipeline. No reimplementation.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  discoverPrompts,
  discoverSkills,
  mergeWithRuntimeCommands,
  sortByName,
  type PaletteItem,
} from "./discovery.ts";
import { dispatch, type DispatchDeps, type DispatchUi, type DispatchRunner } from "./dispatch.ts";

/** Resolve the agent config dir (where prompts/ and skills/ live). */
function agentDir(): string {
  // pi exposes the agent dir via PI_CODING_AGENT_DIR env (set per-stage by
  // the deploy pipeline). Fall back to the canonical ~/.pi/agent.
  const env = process.env.PI_CODING_AGENT_DIR;
  if (env) return env;
  return join(homedir(), ".pi", "agent");
}

/** Discover every palette entry available in this session. */
function gatherItems(
  pi: ExtensionAPI,
  ctx: { cwd?: string },
): PaletteItem[] {
  const dir = agentDir();

  // 1. Disk-discovered prompts + skills.
  const fromDisk = [
    ...discoverPrompts(join(dir, "prompts")),
    ...discoverSkills(join(dir, "skills")),
  ];

  // 2. Project-local prompts (cwd/.pi/prompts) — mirrors pi's own loader.
  //    Defensively default to process.cwd() if ctx.cwd is missing.
  const cwd = ctx?.cwd || process.cwd();
  const projectPrompts = discoverPrompts(join(cwd, ".pi", "prompts"));
  const projectSkills = discoverSkills(join(cwd, ".pi", "skills"));

  // 3. Merge with runtime-registered commands (extension commands).
  //    pi.getCommands() returns every slash command including builtin ones;
  //    we keep ones that didn't already come from disk.
  //    The `source` field ("extension" | "prompt" | "skill") is carried
  //    through so mergeWithRuntimeCommands can tag source=skill commands
  //    with kind=skill — required for /cmd run <bare-skill> to work on
  //    package-sourced skills that don't exist on disk.
  let runtimeNames: {
    name: string;
    description?: string;
    source?: "extension" | "prompt" | "skill";
  }[] = [];
  try {
    runtimeNames = pi.getCommands().map((c) => ({
      name: c.name,
      description: c.description,
      source: c.source,
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

/** Build a DispatchUi from a pi ExtensionCommandContext-like ui object. */
function makeUi(ui: {
  notify(message: string, level?: "info" | "warning" | "error"): void;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  select(title: string, options: string[]): Promise<string | undefined>;
}): DispatchUi {
  return {
    notify: (m, lvl) => ui.notify(m, lvl),
    input: (t, p) => ui.input(t, p),
    select: (t, o) => ui.select(t, o),
  };
}

/** Build a DispatchRunner from pi's sendUserMessage. */
function makeRunner(sendUserMessage: (content: string) => void): DispatchRunner {
  return {
    run: (invocation) => sendUserMessage(invocation),
  };
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
      const deps: DispatchDeps = {
        hasUI: ctx.hasUI,
        getItems: () => gatherItems(pi, ctx),
        ui: makeUi(ctx.ui),
        runner: makeRunner((invocation) => pi.sendUserMessage(invocation)),
      };
      await dispatch(args, deps);
    },
  });
}
