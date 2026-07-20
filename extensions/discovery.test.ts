import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseFrontmatter,
  promptFileToItem,
  skillDirToItem,
  discoverPrompts,
  discoverSkills,
  mergeWithRuntimeCommands,
  sortByName,
  nameFromFile,
  formatListItem,
  displayPath,
} from "./discovery.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "palette-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("parseFrontmatter", () => {
  it("parses a standard frontmatter block", () => {
    const raw = `---\nname: my-cmd\ndescription: A thing\nargument-hint: "<x>"\n---\n\nBody here.`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.name).toBe("my-cmd");
    expect(frontmatter.description).toBe("A thing");
    expect(frontmatter["argument-hint"]).toBe("<x>");
    expect(body.trim()).toBe("Body here.");
  });

  it("strips surrounding quotes from values", () => {
    const raw = `---\nname: "quoted"\ndescription: 'single'\n---\nBody`;
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.name).toBe("quoted");
    expect(frontmatter.description).toBe("single");
  });

  it("returns empty frontmatter when no block present", () => {
    const raw = "Just some markdown, no frontmatter.";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({});
    expect(body).toBe(raw);
  });

  it("tolerates trailing whitespace after the --- separators", () => {
    const raw = "--- \nname: x \n--- \n\nbody";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.name).toBe("x");
    expect(body.trim()).toBe("body");
  });

  it("skips blank lines and comments inside frontmatter", () => {
    const raw = `---\n# a comment\nname: x\n\n---\nbody`;
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.name).toBe("x");
  });

  it("handles description values with trailing inline comments", () => {
    const raw = `---\nname: x\ndescription: hi there # comment\n---\nbody`;
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.description).toBe("hi there");
  });
});

describe("nameFromFile", () => {
  it("strips the extension", () => {
    expect(nameFromFile("/foo/bar/baz.md")).toBe("baz");
    expect(nameFromFile("cmd.md")).toBe("cmd");
  });
});

describe("promptFileToItem", () => {
  it("builds an item from a prompt markdown file", () => {
    const fp = join(tmp, "deploy.md");
    writeFileSync(
      fp,
      `---\nname: deploy\ndescription: Deploy things\nargument-hint: "<stage>"\n---\n\nDeploy body.`,
    );
    const item = promptFileToItem(fp);
    expect(item).not.toBeNull();
    expect(item!.name).toBe("deploy");
    expect(item!.description).toBe("Deploy things");
    expect(item!.argumentHint).toBe("<stage>");
    expect(item!.content).toBe("Deploy body.");
    expect(item!.kind).toBe("prompt");
    expect(item!.filePath).toBe(fp);
  });

  it("falls back to filename when frontmatter has no name", () => {
    const fp = join(tmp, "auto-name.md");
    writeFileSync(fp, `---\ndescription: no name\n---\n\nbody`);
    const item = promptFileToItem(fp);
    expect(item!.name).toBe("auto-name");
  });

  it("returns null on read failure", () => {
    const item = promptFileToItem(join(tmp, "does-not-exist.md"));
    expect(item).toBeNull();
  });
});

describe("skillDirToItem", () => {
  it("reads SKILL.md from a directory", () => {
    const dir = join(tmp, "my-skill");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "SKILL.md"),
      `---\nname: my-skill\ndescription: Does stuff\n---\n\nSkill body.`,
    );
    const item = skillDirToItem(dir);
    expect(item).not.toBeNull();
    expect(item!.name).toBe("my-skill");
    expect(item!.description).toBe("Does stuff");
    expect(item!.content).toBe("Skill body.");
    expect(item!.kind).toBe("skill");
  });

  it("falls back to dirname when SKILL.md frontmatter has no name", () => {
    const dir = join(tmp, "nameless-skill");
    mkdirSync(dir);
    writeFileSync(join(dir, "SKILL.md"), `---\ndescription: x\n---\nbody`);
    const item = skillDirToItem(dir);
    expect(item!.name).toBe("nameless-skill");
  });

  it("returns null when SKILL.md is missing", () => {
    const dir = join(tmp, "empty-skill");
    mkdirSync(dir);
    expect(skillDirToItem(dir)).toBeNull();
  });
});

describe("discoverPrompts", () => {
  it("discovers all .md files at top level", () => {
    mkdirSync(join(tmp, "prompts"));
    writeFileSync(join(tmp, "prompts", "a.md"), `---\nname: a\n---\nbody`);
    writeFileSync(join(tmp, "prompts", "b.md"), `---\nname: b\n---\nbody`);
    // Non-md file is ignored
    writeFileSync(join(tmp, "prompts", "c.txt"), "ignore me");
    const items = discoverPrompts(join(tmp, "prompts"));
    expect(items.map((i) => i.name).sort()).toEqual(["a", "b"]);
  });

  it("returns [] when dir is missing", () => {
    expect(discoverPrompts(join(tmp, "nope"))).toEqual([]);
  });
});

describe("discoverSkills", () => {
  it("discovers skill dirs with SKILL.md", () => {
    mkdirSync(join(tmp, "skills"));
    mkdirSync(join(tmp, "skills", "alpha"));
    writeFileSync(
      join(tmp, "skills", "alpha", "SKILL.md"),
      `---\nname: alpha\n---\nbody`,
    );
    const items = discoverSkills(join(tmp, "skills"));
    expect(items.map((i) => i.name)).toEqual(["alpha"]);
  });

  it("recurses one level deep for nested SKILL.md", () => {
    mkdirSync(join(tmp, "skills"));
    mkdirSync(join(tmp, "skills", "group"));
    mkdirSync(join(tmp, "skills", "group", "beta"));
    writeFileSync(
      join(tmp, "skills", "group", "beta", "SKILL.md"),
      `---\nname: beta\n---\nbody`,
    );
    const items = discoverSkills(join(tmp, "skills"));
    expect(items.map((i) => i.name)).toEqual(["beta"]);
  });

  it("discovers top-level .md files as skills (rare but supported)", () => {
    mkdirSync(join(tmp, "skills"));
    writeFileSync(join(tmp, "skills", "loose.md"), `---\nname: loose\n---\nbody`);
    const items = discoverSkills(join(tmp, "skills"));
    expect(items.map((i) => i.name)).toEqual(["loose"]);
  });

  it("returns [] when dir is missing", () => {
    expect(discoverSkills(join(tmp, "nope"))).toEqual([]);
  });
});

describe("mergeWithRuntimeCommands", () => {
  it("appends runtime commands not already on disk", () => {
    const disk = [
      {
        name: "deploy",
        description: "from disk",
        content: "x",
        kind: "prompt" as const,
        filePath: "/x",
      },
    ];
    const runtime = [
      { name: "deploy", description: "duplicate" },
      { name: "enforcer-status", description: "extension command" },
    ];
    const merged = mergeWithRuntimeCommands(disk, runtime);
    expect(merged.map((m) => m.name).sort()).toEqual([
      "deploy",
      "enforcer-status",
    ]);
    // The disk version wins for duplicates.
    expect(merged.find((m) => m.name === "deploy")!.description).toBe(
      "from disk",
    );
  });

  it("drops the skill:<name> runtime twin when a disk skill exists", () => {
    const disk = [
      {
        name: "audit-skill",
        description: "from disk",
        content: "body",
        kind: "skill" as const,
        filePath: "/s/audit-skill/SKILL.md",
      },
    ];
    const runtime = [
      { name: "skill:audit-skill", description: "runtime twin", source: "skill" as const },
      { name: "skill:other-skill", description: "no disk twin — kept as bare skill", source: "skill" as const },
      { name: "enforcer-status", description: "unrelated runtime cmd", source: "extension" as const },
    ];
    const merged = mergeWithRuntimeCommands(disk, runtime);
    const names = merged.map((m) => m.name).sort();
    // skill:audit-skill is dropped (disk skill wins); skill:other-skill is
    // kept as the BARE name (other-skill) and tagged kind=skill so RUN
    // injects /skill:other-skill.
    expect(names).toEqual(["audit-skill", "enforcer-status", "other-skill"]);
    // Disk version of audit-skill wins.
    expect(merged.find((m) => m.name === "audit-skill")!.kind).toBe("skill");
    // Runtime-only skill is tagged kind=skill, NOT command.
    const otherSkill = merged.find((m) => m.name === "other-skill");
    expect(otherSkill?.kind).toBe("skill");
  });

  it("tags source=skill runtime commands as kind=skill (no disk twin)", () => {
    // Reproduces verifier v2 r4 defect 1: package-sourced skills like
    // pi-subagents, pi-acp-agents, pi-holdpty, etc. never appear under
    // <agentDir>/skills/ on disk but DO show up in pi.getCommands() with
    // source="skill". These MUST be tagged kind=skill so /cmd run <bare>
    // emits /skill:<bare> instead of /<bare> (which pi would NOT expand).
    const runtime = [
      { name: "skill:pi-subagents", description: "package skill", source: "skill" as const },
      { name: "skill:gitnexus-debugging", description: "git skill", source: "skill" as const },
      { name: "enforcer-status", description: "extension cmd", source: "extension" as const },
    ];
    const merged = mergeWithRuntimeCommands([], runtime);
    const subagents = merged.find((m) => m.description === "package skill");
    expect(subagents?.name).toBe("pi-subagents"); // bare name stored
    expect(subagents?.kind).toBe("skill"); // tagged kind=skill
    const gitSkill = merged.find((m) => m.description === "git skill");
    expect(gitSkill?.name).toBe("gitnexus-debugging");
    expect(gitSkill?.kind).toBe("skill");
    const extCmd = merged.find((m) => m.description === "extension cmd");
    expect(extCmd?.kind).toBe("command");
  });

  it("drops the skill:<name> runtime twin only when source matches", () => {
    // Edge case: a runtime command literally named 'skill:foo' but with
    // source=extension should NOT be confused with a skill. It is kept as-is.
    const disk = [
      { name: "foo", description: "disk skill", content: "", kind: "skill" as const, filePath: "/s" },
    ];
    const runtime = [
      { name: "skill:foo", description: "real skill twin", source: "skill" as const },
      { name: "skill:bar", description: "extension pretending", source: "extension" as const },
    ];
    const merged = mergeWithRuntimeCommands(disk, runtime);
    // skill:foo is dropped (disk foo wins); skill:bar kept (not actually a skill).
    const names = merged.map((m) => m.name).sort();
    expect(names).toEqual(["foo", "skill:bar"]);
  });
});

describe("sortByName", () => {
  it("sorts case-insensitively", () => {
    const items = [
      { name: "Banana", description: "", content: "", kind: "prompt" as const, filePath: "" },
      { name: "apple", description: "", content: "", kind: "prompt" as const, filePath: "" },
    ];
    const sorted = sortByName(items);
    expect(sorted.map((i) => i.name)).toEqual(["apple", "Banana"]);
  });

  it("sorts numerically when appropriate", () => {
    const items = [
      { name: "10-thing", description: "", content: "", kind: "prompt" as const, filePath: "" },
      { name: "2-thing", description: "", content: "", kind: "prompt" as const, filePath: "" },
    ];
    const sorted = sortByName(items);
    expect(sorted.map((i) => i.name)).toEqual(["2-thing", "10-thing"]);
  });
});

describe("formatListItem", () => {
  it("renders one line with kind tag, name, hint, and description", () => {
    const item = {
      name: "deploy",
      description: "Deploy things",
      content: "",
      kind: "prompt" as const,
      filePath: "/x",
      argumentHint: "<stage>",
    };
    const line = formatListItem(item, 0);
    expect(line).toContain("[cmd] /deploy");
    expect(line).toContain("<stage>");
    expect(line).toContain("Deploy things");
  });
});

describe("displayPath", () => {
  it("returns (runtime) for items with no filePath", () => {
    const item = {
      name: "x",
      description: "",
      content: "",
      kind: "command" as const,
      filePath: "",
    };
    expect(displayPath(item)).toBe("(runtime)");
  });

  it("returns a relative path when root is given", () => {
    const item = {
      name: "x",
      description: "",
      content: "",
      kind: "prompt" as const,
      filePath: join(tmp, "prompts", "x.md"),
    };
    const rel = displayPath(item, tmp);
    expect(rel).toBe("prompts/x.md");
  });
});
