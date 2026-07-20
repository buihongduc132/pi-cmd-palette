import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dispatch,
  findItemByName,
  normalizeName,
  searchItems,
  buildInvocation,
  resolveItemForRun,
  type DispatchDeps,
  type DispatchUi,
  type DispatchRunner,
} from "./dispatch.ts";
import type { PaletteItem } from "./discovery.ts";

/** Build a fake UI that records calls and returns scripted responses. */
function makeFakeUi(opts: {
  inputs?: (string | undefined)[]; // queued input() responses
  selects?: (string | undefined)[]; // queued select() responses
} = {}): DispatchUi & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  let inputIdx = 0;
  let selectIdx = 0;
  return {
    calls,
    notify(message: string, level?: "info" | "warning" | "error") {
      calls.push({ method: "notify", args: [message, level] });
    },
    input: async (title: string, placeholder?: string) => {
      calls.push({ method: "input", args: [title, placeholder] });
      return opts.inputs?.[inputIdx++];
    },
    select: async (title: string, options: string[]) => {
      calls.push({ method: "select", args: [title, options] });
      return opts.selects?.[selectIdx++];
    },
  };
}

/** Build a fake runner that records invocations. */
function makeFakeRunner(): DispatchRunner & {
  invocations: string[];
} {
  const invocations: string[] = [];
  return {
    invocations,
    run: (invocation: string) => {
      invocations.push(invocation);
    },
  };
}

/** Build a sample item set. */
function sampleItems(): PaletteItem[] {
  return [
    {
      name: "deploy",
      description: "Deploy things",
      content: "deploy body",
      kind: "prompt",
      filePath: "/p/deploy.md",
      argumentHint: "<stage>",
    },
    {
      name: "audit-skill",
      description: "Audit stuff",
      content: "audit body",
      kind: "skill",
      filePath: "/s/audit-skill/SKILL.md",
    },
    {
      name: "enforcer-status",
      description: "",
      content: "",
      kind: "command",
      filePath: "",
    },
  ];
}

function makeDeps(
  ui: DispatchUi & { calls: { method: string; args: unknown[] }[] },
  runner: DispatchRunner & { invocations: string[] },
  items: PaletteItem[],
  hasUI = true,
): DispatchDeps {
  return {
    hasUI,
    getItems: () => items,
    ui,
    runner,
  };
}

describe("normalizeName", () => {
  it("strips a leading slash", () => {
    expect(normalizeName("/deploy")).toBe("deploy");
    expect(normalizeName("deploy")).toBe("deploy");
  });
});

describe("findItemByName", () => {
  const items = sampleItems();

  it("finds by exact name", () => {
    expect(findItemByName(items, "deploy")?.name).toBe("deploy");
  });

  it("is case-insensitive", () => {
    expect(findItemByName(items, "DEPLOY")?.name).toBe("deploy");
  });

  it("tolerates a leading slash in the lookup key", () => {
    expect(findItemByName(items, "/deploy")?.name).toBe("deploy");
  });

  it("returns undefined for unknown name", () => {
    expect(findItemByName(items, "nope")).toBeUndefined();
  });
});

describe("searchItems", () => {
  const items = sampleItems();

  it("returns all items on empty query", () => {
    expect(searchItems(items, "")).toHaveLength(items.length);
    expect(searchItems(items, "   ")).toHaveLength(items.length);
  });

  it("filters by fuzzy match on name", () => {
    const results = searchItems(items, "dep");
    expect(results.map((r) => r.name)).toContain("deploy");
  });

  it("filters by fuzzy match on description", () => {
    const results = searchItems(items, "audit");
    expect(results.map((r) => r.name)).toContain("audit-skill");
  });

  it("filters by fuzzy match on content", () => {
    const results = searchItems(items, "body");
    // Both deploy and audit-skill have "body" in their content.
    const names = results.map((r) => r.name);
    expect(names).toContain("deploy");
    expect(names).toContain("audit-skill");
  });
});

describe("dispatch — help", () => {
  it("notifies with help text on 'help'", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch("help", makeDeps(ui, runner, sampleItems()));
    expect(outcome.kind).toBe("notified");
    expect(ui.calls.some((c) => c.method === "notify")).toBe(true);
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("list");
    expect(String(notify?.args[0])).toContain("read");
    expect(String(notify?.args[0])).toContain("run");
  });

  it("also accepts '?' as help alias", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch("?", makeDeps(ui, runner, sampleItems()));
    expect(outcome.kind).toBe("notified");
  });
});

describe("dispatch — read", () => {
  it("notifies with full detail for a known item", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "read deploy",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("/deploy");
    expect(String(notify?.args[0])).toContain("Deploy things");
    expect(String(notify?.args[0])).toContain("Kind: prompt");
  });

  it("warns when no name given", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch("read", makeDeps(ui, runner, sampleItems()));
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[1])).toBe("warning");
  });

  it("warns when name unknown", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "read nope",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("No command named /nope");
  });
});

describe("dispatch — run", () => {
  it("re-injects /<name> with no args (prompt)", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "run deploy",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("ran");
    expect((outcome as { invocation: string }).invocation).toBe("/deploy");
    expect(runner.invocations).toEqual(["/deploy"]);
  });

  it("re-injects /<name> <args> with args (prompt)", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "run deploy prod --force",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("ran");
    expect((outcome as { invocation: string }).invocation).toBe(
      "/deploy prod --force",
    );
    expect(runner.invocations).toEqual(["/deploy prod --force"]);
  });

  it("re-injects /skill:<name> for a skill (CRITICAL — pi requires the skill: prefix)", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "run audit-skill",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("ran");
    expect((outcome as { invocation: string }).invocation).toBe("/skill:audit-skill");
    expect(runner.invocations).toEqual(["/skill:audit-skill"]);
  });

  it("re-injects /skill:<name> <args> for a skill with args", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "run audit-skill --deep",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("ran");
    expect((outcome as { invocation: string }).invocation).toBe(
      "/skill:audit-skill --deep",
    );
  });

  it("warns when no name given", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch("run", makeDeps(ui, runner, sampleItems()));
    expect(outcome.kind).toBe("notified");
  });

  it("warns when name unknown", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "run nope",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[1])).toBe("warning");
  });
});

describe("buildInvocation", () => {
  it("uses bare /<name> for prompt kind", () => {
    const item: PaletteItem = {
      name: "deploy",
      description: "",
      content: "",
      kind: "prompt",
      filePath: "",
    };
    expect(buildInvocation(item, "")).toBe("/deploy");
    expect(buildInvocation(item, "prod")).toBe("/deploy prod");
  });

  it("uses /skill:<name> for skill kind", () => {
    const item: PaletteItem = {
      name: "audit",
      description: "",
      content: "",
      kind: "skill",
      filePath: "",
    };
    expect(buildInvocation(item, "")).toBe("/skill:audit");
    expect(buildInvocation(item, "--deep")).toBe("/skill:audit --deep");
  });

  it("uses bare /<name> for extension command kind", () => {
    const item: PaletteItem = {
      name: "enforcer-status",
      description: "",
      content: "",
      kind: "command",
      filePath: "",
    };
    expect(buildInvocation(item, "")).toBe("/enforcer-status");
  });

  it("trims whitespace from args", () => {
    const item: PaletteItem = {
      name: "x",
      description: "",
      content: "",
      kind: "prompt",
      filePath: "",
    };
    expect(buildInvocation(item, "  prod  ")).toBe("/x prod");
  });
});

describe("resolveItemForRun", () => {
  const items: PaletteItem[] = [
    { name: "deploy", description: "", content: "", kind: "prompt", filePath: "" },
    { name: "audit", description: "", content: "", kind: "skill", filePath: "" },
    { name: "enforcer", description: "", content: "", kind: "command", filePath: "" },
    // Runtime twin of the skill:
    { name: "skill:audit", description: "", content: "", kind: "command", filePath: "" },
  ];

  it("resolves bare name to prompt", () => {
    expect(resolveItemForRun(items, "deploy")?.name).toBe("deploy");
  });

  it("resolves bare name to skill (prefers disk over runtime twin)", () => {
    const hit = resolveItemForRun(items, "audit");
    expect(hit?.name).toBe("audit");
    expect(hit?.kind).toBe("skill");
  });

  it("resolves `skill:<name>` form to the skill", () => {
    const hit = resolveItemForRun(items, "skill:audit");
    expect(hit?.name).toBe("audit");
    expect(hit?.kind).toBe("skill");
  });

  it("resolves extension command name", () => {
    expect(resolveItemForRun(items, "enforcer")?.name).toBe("enforcer");
  });

  it("returns undefined for unknown", () => {
    expect(resolveItemForRun(items, "nope")).toBeUndefined();
  });

  it("tolerates leading slash in the query", () => {
    expect(resolveItemForRun(items, "/deploy")?.name).toBe("deploy");
  });
});

describe("dispatch — list", () => {
  it("lists all items with no query", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "list",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("/deploy");
    expect(String(notify?.args[0])).toContain("/audit-skill");
  });

  it("filters by query", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "list dep",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("/deploy");
    expect(String(notify?.args[0])).toContain('for "dep"');
  });
});

describe("dispatch — default fuzzy list", () => {
  it("treats unknown first token as a fuzzy query", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "dep",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("/deploy");
  });

  it("notifies 'no matches' when query has no hits", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "zzzzz",
      makeDeps(ui, runner, sampleItems()),
    );
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("No matches");
  });
});

describe("dispatch — interactive picker (hasUI=true)", () => {
  it("skips to picker, then RUNs a prompt pick", async () => {
    const ui = makeFakeUi({
      inputs: ["dep", "prod"], // first = query, second = args
      selects: ["/deploy  [cmd] — Deploy things"],
    });
    const runner = makeFakeRunner();
    const outcome = await dispatch("", makeDeps(ui, runner, sampleItems()));

    expect(outcome.kind).toBe("ran");
    expect((outcome as { invocation: string }).invocation).toBe("/deploy prod");
    expect(runner.invocations).toEqual(["/deploy prod"]);
  });

  it("picker + skill pick → re-injects /skill:<name>", async () => {
    const ui = makeFakeUi({
      inputs: ["audit", ""], // query, then empty args
      selects: ["/audit-skill  [skill] — Audit stuff"],
    });
    const runner = makeFakeRunner();
    const outcome = await dispatch("", makeDeps(ui, runner, sampleItems()));

    expect(outcome.kind).toBe("ran");
    expect((outcome as { invocation: string }).invocation).toBe("/skill:audit-skill");
    expect(runner.invocations).toEqual(["/skill:audit-skill"]);
  });

  it("picks a runtime command (no content) → READ", async () => {
    const ui = makeFakeUi({
      inputs: ["enforcer"], // query
      selects: ["/enforcer-status  [command]"],
    });
    const runner = makeFakeRunner();
    const outcome = await dispatch("", makeDeps(ui, runner, sampleItems()));

    expect(outcome.kind).toBe("picked-read");
    // Runner should NOT have been called.
    expect(runner.invocations).toEqual([]);
  });

  it("cancels cleanly when input prompt is escaped", async () => {
    const ui = makeFakeUi({
      inputs: [undefined], // user escapes the query input
    });
    const runner = makeFakeRunner();
    const outcome = await dispatch("", makeDeps(ui, runner, sampleItems()));
    expect(outcome.kind).toBe("cancelled");
    expect(runner.invocations).toEqual([]);
  });

  it("cancels cleanly when select is escaped", async () => {
    const ui = makeFakeUi({
      inputs: ["dep"],
      selects: [undefined], // user escapes the picker
    });
    const runner = makeFakeRunner();
    const outcome = await dispatch("", makeDeps(ui, runner, sampleItems()));
    expect(outcome.kind).toBe("cancelled");
    expect(runner.invocations).toEqual([]);
  });

  it("cancels cleanly when args prompt is escaped (after picking)", async () => {
    const ui = makeFakeUi({
      inputs: ["dep", undefined], // query OK, args escaped
      selects: ["/deploy  [cmd] — Deploy things"],
    });
    const runner = makeFakeRunner();
    const outcome = await dispatch("", makeDeps(ui, runner, sampleItems()));
    expect(outcome.kind).toBe("cancelled");
    expect(runner.invocations).toEqual([]);
  });

  it("notifies 'no matches' when query returns nothing", async () => {
    const ui = makeFakeUi({
      inputs: ["zzzz"],
    });
    const runner = makeFakeRunner();
    const outcome = await dispatch("", makeDeps(ui, runner, sampleItems()));
    expect(outcome.kind).toBe("notified");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("No matches");
  });
});

describe("dispatch — no UI fallback", () => {
  it("falls back to printing the full list when hasUI=false", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const outcome = await dispatch(
      "",
      makeDeps(ui, runner, sampleItems(), false),
    );
    expect(outcome.kind).toBe("picker-skipped-no-ui");
    const notify = ui.calls.find((c) => c.method === "notify");
    expect(String(notify?.args[0])).toContain("/deploy");
  });
});
