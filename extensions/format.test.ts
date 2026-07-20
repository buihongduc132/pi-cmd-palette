import { describe, it, expect } from "vitest";
import {
  formatList,
  formatRead,
  formatHelp,
  selectLabel,
  invocationPrefix,
} from "./format.ts";
import type { PaletteItem } from "./discovery.ts";

function mk(
  over: Partial<PaletteItem> = {},
): PaletteItem {
  return {
    name: "x",
    description: "",
    content: "",
    kind: "prompt",
    filePath: "",
    ...over,
  };
}

describe("selectLabel", () => {
  it("renders kind tag, name, and description for prompt", () => {
    const label = selectLabel(
      mk({ name: "deploy", description: "Deploy", kind: "prompt" }),
    );
    expect(label).toBe("/deploy  [cmd] — Deploy");
  });

  it("renders skill tag correctly", () => {
    const label = selectLabel(mk({ name: "x", kind: "skill" }));
    expect(label).toContain("[skill]");
  });

  it("uses /skill: prefix for skill kind (canonical invocation form)", () => {
    const label = selectLabel(mk({ name: "audit", kind: "skill" }));
    expect(label.startsWith("/skill:audit")).toBe(true);
  });

  it("uses bare / prefix for prompt kind", () => {
    const label = selectLabel(mk({ name: "deploy", kind: "prompt" }));
    expect(label.startsWith("/deploy")).toBe(true);
  });
});

describe("invocationPrefix", () => {
  it("returns /skill: for skill kind", () => {
    expect(invocationPrefix(mk({ kind: "skill" }))).toBe("/skill:");
  });

  it("returns / for prompt kind", () => {
    expect(invocationPrefix(mk({ kind: "prompt" }))).toBe("/");
  });

  it("returns / for command kind", () => {
    expect(invocationPrefix(mk({ kind: "command" }))).toBe("/");
  });
});

describe("formatList", () => {
  it("handles empty list", () => {
    expect(formatList([])).toBe("No commands found.");
  });

  it("renders one numbered line per item", () => {
    const items = [
      mk({ name: "a", description: "alpha" }),
      mk({ name: "b", description: "beta" }),
    ];
    const out = formatList(items);
    expect(out).toContain("1.");
    expect(out).toContain("/a");
    expect(out).toContain("alpha");
    expect(out).toContain("/b");
    expect(out).toContain("beta");
  });

  it("uses /skill: prefix for skill-kind items in list", () => {
    const items = [
      mk({ name: "audit", description: "audit skill", kind: "skill" }),
      mk({ name: "deploy", description: "deploy prompt", kind: "prompt" }),
    ];
    const out = formatList(items);
    expect(out).toContain("/skill:audit");
    expect(out).toContain("/deploy");
  });

  it("truncates after maxItems", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      mk({ name: `c${i}`, description: "" }),
    );
    const out = formatList(items, 3);
    expect(out).toContain("more, refine query");
  });
});

describe("formatRead", () => {
  it("renders name, description, kind, source, and body", () => {
    const item = mk({
      name: "deploy",
      description: "Deploy things",
      kind: "prompt",
      filePath: "/x/deploy.md",
      content: "Body line 1.",
      argumentHint: "<stage>",
    });
    const out = formatRead(item);
    expect(out).toContain("/deploy");
    expect(out).toContain("Description: Deploy things");
    expect(out).toContain("Kind: prompt");
    expect(out).toContain("Arguments: <stage>");
    expect(out).toContain("Source: /x/deploy.md");
    expect(out).toContain("Body line 1.");
  });

  it("truncates very long bodies", () => {
    const long = "x".repeat(3000);
    const item = mk({ content: long });
    const out = formatRead(item, 100);
    expect(out).toContain("truncated");
  });

  it("shows runtime note for extension commands without content", () => {
    const item = mk({ kind: "command", content: "", filePath: "" });
    const out = formatRead(item);
    expect(out).toContain("registered by an extension at runtime");
  });
});

describe("formatHelp", () => {
  it("mentions list/read/run subactions", () => {
    const help = formatHelp();
    expect(help).toContain("list");
    expect(help).toContain("read");
    expect(help).toContain("run");
    expect(help).toContain("fuzzy");
  });
});
