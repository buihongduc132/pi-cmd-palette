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
