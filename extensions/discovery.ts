/**
 * discovery.ts — Pure discovery + parsing helpers (no pi imports).
 *
 * Walks the standard pi directories:
 *   - prompts/    : slash commands surfaced as `/<name>`
 *   - skills/     : `<dir>/SKILL.md`, surfaced as `/skill:<name>` or
 *                   `/skills/<name>` (model-invocable, but also runnable)
 *   - agents/     : wear-hats subagent definitions (for completeness)
 *
 * Each discovered item is normalized into a {@link PaletteItem} so the
 * palette UI, fuzzy ranker, and RUN handler all share one shape.
 */

import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, basename, extname, relative } from "node:path";

/** Kind of palette entry. */
export type PaletteKind = "command" | "prompt" | "skill";

/** Normalized palette entry. */
export interface PaletteItem {
  /** Slash-command invocation name, WITHOUT the leading slash. */
  name: string;
  /** Short human description (from frontmatter `description`). */
  description: string;
  /** Full body content (for READ + fuzzy-over-content). */
  content: string;
  /** Kind: prompt-sourced command, skill-sourced, or extension command. */
  kind: PaletteKind;
  /** Absolute file path on disk (prompts/skills); "" for runtime commands. */
  filePath: string;
  /** Optional frontmatter `argument-hint` (shown in palette). */
  argumentHint?: string;
}

/** Parse YAML-like frontmatter from a markdown file. */
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const fm: Record<string, string> = {};
  // Match opening --- ... closing --- on the very first lines.
  // Allow optional trailing whitespace after each `---` separator (common
  // in hand-edited markdown files).
  const match = raw.match(/^\s*---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: fm, body: raw };
  }
  const block = match[1];
  const rest = match[2];

  for (const line of block.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    // strip surrounding quotes, strip trailing inline comment after the value
    let value = line
      .slice(idx + 1)
      .trim()
      .replace(/(^["']|["']$)/g, "");
    const hashIdx = value.indexOf(" #");
    if (hashIdx > 0) value = value.slice(0, hashIdx).trim();
    fm[key] = value;
  }
  return { frontmatter: fm, body: rest };
}

/** Read a file as UTF-8, returning "" on error (defensive). */
export function readText(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/** Derive the slash-command name from a markdown filename. */
export function nameFromFile(filePath: string): string {
  const base = basename(filePath);
  const ext = extname(base);
  return base.slice(0, base.length - ext.length);
}

/** Build a PaletteItem from a prompt markdown file. */
export function promptFileToItem(filePath: string): PaletteItem | null {
  const raw = readText(filePath);
  if (!raw) return null;
  const { frontmatter, body } = parseFrontmatter(raw);
  const name = frontmatter.name || nameFromFile(filePath);
  return {
    name,
    description: frontmatter.description ?? "",
    content: body.trim(),
    kind: "prompt",
    filePath,
    argumentHint: frontmatter["argument-hint"],
  };
}

/** Build a PaletteItem from a skill directory (expects `<dir>/SKILL.md`). */
export function skillDirToItem(dir: string): PaletteItem | null {
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) return null;
  const raw = readText(skillMd);
  if (!raw) return null;
  const { frontmatter, body } = parseFrontmatter(raw);
  const name = frontmatter.name || basename(dir);
  return {
    name,
    description: frontmatter.description ?? "",
    content: body.trim(),
    kind: "skill",
    filePath: skillMd,
    argumentHint: frontmatter["argument-hint"],
  };
}

/** True if a path is a directory. */
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Safe directory reader. Returns [] on any error (unreadable dir, race
 * condition where the dir is deleted between the isDir check and read,
 * permission issues, etc.) so the palette never crashes mid-discovery.
 */
function safeReaddir(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

/**
 * Scan a prompts directory for `*.md` files (non-recursive at top level —
 * matches pi's own loader).
 */
export function discoverPrompts(promptsDir: string): PaletteItem[] {
  if (!isDir(promptsDir)) return [];
  const items: PaletteItem[] = [];
  for (const entry of safeReaddir(promptsDir)) {
    const fp = join(promptsDir, entry);
    if (!isDir(fp) && entry.endsWith(".md")) {
      const item = promptFileToItem(fp);
      if (item) items.push(item);
    }
  }
  return items;
}

/**
 * Scan a skills directory. Discovery rules match pi:
 *   - if entry is a directory with `SKILL.md` → one skill
 *   - if entry is a directory, recurse one level for `SKILL.md`
 *   - if entry is a top-level `.md` file → treat as skill (rare)
 */
export function discoverSkills(skillsDir: string): PaletteItem[] {
  if (!isDir(skillsDir)) return [];
  const items: PaletteItem[] = [];
  for (const entry of safeReaddir(skillsDir)) {
    const fp = join(skillsDir, entry);
    if (isDir(fp)) {
      // Direct child with SKILL.md?
      const direct = skillDirToItem(fp);
      if (direct) {
        items.push(direct);
        continue;
      }
      // Otherwise scan one level deeper.
      for (const inner of safeReaddir(fp)) {
        const innerFp = join(fp, inner);
        if (isDir(innerFp)) {
          const nested = skillDirToItem(innerFp);
          if (nested) items.push(nested);
        }
      }
    } else if (entry.endsWith(".md")) {
      // Top-level .md in skills/: rare, treat as skill.
      const raw = readText(fp);
      const { frontmatter, body } = parseFrontmatter(raw);
      const name = frontmatter.name || nameFromFile(fp);
      items.push({
        name,
        description: frontmatter.description ?? "",
        content: body.trim(),
        kind: "skill",
        filePath: fp,
      });
    }
  }
  return items;
}

/** A runtime command from pi (extension-registered). */
export interface RuntimeCommand {
  name: string;
  description?: string;
  /**
   * pi-reported source: `"extension"` (registered via pi.registerCommand),
   * `"prompt"` (markdown template), or `"skill"` (a skill surfaced as
   * `skill:<name>`). Used to tag the merged item's `kind` correctly so
   * the dispatcher knows to inject `/skill:<name>` instead of `/<name>`.
   * See SlashCommandInfo in @mariozechner/pi-coding-agent.
   */
  source?: "extension" | "prompt" | "skill";
}

/**
 * Merge disk-discovered items with pi runtime commands, dedup by name.
 *
 * Special-cases:
 *   - pi registers every skill as a runtime command named `skill:<name>`
 *     with `source: "skill"` (agent-session.js). Disk-discovered skills
 *     use the bare name (e.g. `audit-skill`). To avoid duplicate palette
 *     entries, we drop the `skill:<name>` runtime twin when a disk skill
 *     of the same bare name exists — the disk entry wins because it
 *     carries inline content for READ.
 *   - When a runtime command's `source === "skill"` (no disk twin — typical
 *     for package-sourced skills), we tag the merged item `kind: "skill"`
 *     so the dispatcher emits `/skill:<name>` instead of `/<name>`.
 *     Without this, RUN-by-bare-name fails for the majority of real-world
 *     skills (pi-subagents, pi-acp-agents, pi-holdpty, etc.) because pi
 *     only expands skills when the text starts with `/skill:`.
 */
export function mergeWithRuntimeCommands(
  diskItems: PaletteItem[],
  runtime: RuntimeCommand[],
): PaletteItem[] {
  const seen = new Set(diskItems.map((i) => i.name));
  // Track skill bare names so we can drop their `skill:<name>` runtime twins.
  const skillBareNames = new Set(
    diskItems.filter((i) => i.kind === "skill").map((i) => i.name.toLowerCase()),
  );

  const merged = [...diskItems];
  for (const cmd of runtime) {
    if (seen.has(cmd.name)) continue;

    // Drop `skill:<name>` runtime twin if disk skill of the same bare name exists.
    // Only drop if the runtime command is actually a skill (source=skill);
    // an extension command coincidentally named `skill:bar` is NOT a twin.
    const lowerName = cmd.name.toLowerCase();
    if (
      cmd.source === "skill" &&
      lowerName.startsWith("skill:") &&
      skillBareNames.has(lowerName.slice("skill:".length))
    ) {
      continue;
    }

    // Tag source=skill runtime commands as kind=skill so the dispatcher
    // emits `/skill:<name>`. These are skills from packages/git sources
    // that don't appear under <agentDir>/skills/ on disk.
    //
    // IMPORTANT: detect "is this a skill?" from the SOURCE field, NOT from
    // the name prefix. An extension could legitimately register a command
    // named `skill:bar` with source=extension — that is NOT a skill and
    // must keep its full name and command kind.
    const isRuntimeSkill = cmd.source === "skill";
    const kind: PaletteKind = isRuntimeSkill ? "skill" : "command";

    // For runtime skills pi gives us the name already in `skill:<bare>` form.
    // Strip that prefix so we store the BARE name (matches disk-skill shape)
    // and buildInvocation can re-add it consistently.
    const itemName =
      isRuntimeSkill && lowerName.startsWith("skill:")
        ? cmd.name.slice("skill:".length)
        : cmd.name;

    merged.push({
      name: itemName,
      description: cmd.description ?? "",
      content: "",
      kind,
      filePath: "",
    });
  }
  return merged;
}

/** Render one item for a plain-text list (used by LIST output). */
export function formatListItem(item: PaletteItem, index: number): string {
  const kindTag = item.kind === "prompt" ? "cmd" : item.kind;
  const hint = item.argumentHint ? `  ${item.argumentHint}` : "";
  const desc = item.description ? ` — ${item.description}` : "";
  const prefix = item.kind === "skill" ? "/skill:" : "/";
  return `${String(index + 1).padStart(3, " ")}. [${kindTag}] ${prefix}${item.name}${hint}${desc}`;
}

/** Sort items alphabetically (stable, case-insensitive). */
export function sortByName(items: PaletteItem[]): PaletteItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
    numeric: true,
  }));
}

/** Helper for tests: relative path display. */
export function displayPath(item: PaletteItem, root?: string): string {
  if (!item.filePath) return "(runtime)";
  if (!root) return item.filePath;
  try {
    return relative(root, item.filePath) || item.filePath;
  } catch {
    return item.filePath;
  }
}
