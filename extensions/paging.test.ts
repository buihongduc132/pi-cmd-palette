/**
 * paging.test.ts — RED phase: paging + default-show-all.
 *
 * These tests describe the TARGET behavior. They MUST fail right now
 * because formatList takes (items, maxItems:number) and dispatch has
 * no `page N` parsing or showAll default.
 *
 * GREEN phase will:
 *   - extend formatList to accept FormatListOptions | number
 *   - add page N parsing in dispatch list path
 *   - default bare `/cmd list` to showAll=true
 *
 * See flow/findings/2026-07-24-cmd-palette-enhancements/paging-design.md.
 */

import { describe, it, expect } from "vitest";
import { formatList } from "./format.ts";
import { dispatch, type DispatchDeps, type DispatchUi, type DispatchRunner } from "./dispatch.ts";
import type { PaletteItem } from "./discovery.ts";

// ---------- helpers ----------

function mkItem(i: number, kind: PaletteItem["kind"] = "prompt"): PaletteItem {
  return {
    name: `c${String(i).padStart(3, "0")}`,
    description: `item ${i}`,
    content: "",
    kind,
    filePath: `/p/c${i}.md`,
  };
}

function items(n: number, kind: PaletteItem["kind"] = "prompt"): PaletteItem[] {
  return Array.from({ length: n }, (_, i) => mkItem(i, kind));
}

/** Fake UI recording calls. */
function makeFakeUi(opts: { inputs?: (string | undefined)[]; selects?: (string | undefined)[] } = {}):
  DispatchUi & { calls: { method: string; args: unknown[] }[]; messages: string[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  const messages: string[] = [];
  let inputIdx = 0;
  let selectIdx = 0;
  return {
    calls,
    messages,
    notify(message: string, level?: "info" | "warning" | "error") {
      calls.push({ method: "notify", args: [message, level] });
      messages.push(message);
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

function makeFakeRunner(): DispatchRunner & { invocations: string[] } {
  const invocations: string[] = [];
  return { invocations, run: (inv) => invocations.push(inv) };
}

function makeDeps(ui: ReturnType<typeof makeFakeUi>, runner: ReturnType<typeof makeFakeRunner>, itemList: PaletteItem[], hasUI = false): DispatchDeps {
  return { hasUI, getItems: () => itemList, ui, runner };
}

// ---------- formatList paging ----------

describe("formatList paging", () => {
  it("page 1 size 50 shows range footer with 'more' count for 194 items", () => {
    const out = formatList(items(194), { page: 1, pageSize: 50 });
    expect(out).toContain("Showing 1-50 of 194");
    expect(out).toContain("144 more");
    // Should NOT contain item 51+ on page 1.
    expect(out).not.toContain("item 51");
  });

  it("page 2 size 50 shows items 51-100 range", () => {
    const out = formatList(items(194), { page: 2, pageSize: 50 });
    expect(out).toContain("Showing 51-100 of 194");
    expect(out).toContain("item 50");
    expect(out).toContain("item 99");
    expect(out).not.toContain("item 49");
    expect(out).not.toContain("item 100");
  });

  it("last partial page shows range with no 'more' footer", () => {
    // 194 items, page 4 size 50 = items 151-194 (44 items), no more.
    const out = formatList(items(194), { page: 4, pageSize: 50 });
    expect(out).toContain("Showing 151-194 of 194");
    expect(out).not.toContain("more");
  });

  it("out-of-range page clamps to last non-empty page", () => {
    // 194 items, page 5 size 50 → only 4 pages exist. Clamp to page 4.
    const out = formatList(items(194), { page: 5, pageSize: 50 });
    expect(out).toContain("Showing 151-194 of 194");
  });

  it("page smaller than pageSize shows all with no footer", () => {
    const out = formatList(items(30), { page: 1, pageSize: 50 });
    expect(out).toContain("item 0");
    expect(out).toContain("item 29");
    expect(out).not.toContain("Showing");
    expect(out).not.toContain("more");
  });

  it("default page=1 pageSize=50 when opts empty object", () => {
    const out = formatList(items(75), {});
    expect(out).toContain("Showing 1-50 of 75");
    expect(out).toContain("25 more");
  });
});

// ---------- formatList showAll ----------

describe("formatList showAll", () => {
  it("showAll=true renders every item with 'Showing all N' footer when N > footerThreshold (200)", () => {
    const out = formatList(items(250), { showAll: true });
    expect(out).toContain("item 0");
    expect(out).toContain("item 249");
    expect(out).toContain("Showing all 250");
    expect(out).not.toContain("more — page");
  });

  it("showAll=true with N below footerThreshold has no footer", () => {
    const out = formatList(items(194), { showAll: true });
    expect(out).toContain("item 0");
    expect(out).toContain("item 193");
    expect(out).not.toContain("Showing all");
    expect(out).not.toContain("more");
  });

  it("showAll=true respects custom footerThreshold", () => {
    const out = formatList(items(75), { showAll: true, footerThreshold: 50 });
    expect(out).toContain("Showing all 75");
  });
});

// ---------- formatList backward compat ----------

describe("formatList legacy maxItems number", () => {
  it("number second arg still caps with old refine-query footer", () => {
    const out = formatList(items(10), 3);
    expect(out).toContain("more, refine query");
    // Should NOT use new paging footer text.
    expect(out).not.toContain("Showing 1-3 of 10");
  });
});

// ---------- dispatch page parsing ----------

describe("dispatch page token parsing", () => {
  it("/cmd list page 2 → notify message shows range 51-100", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const deps = makeDeps(ui, runner, items(120));
    await dispatch("list page 2", deps);
    expect(ui.messages.length).toBeGreaterThan(0);
    const msg = ui.messages[0];
    expect(msg).toContain("Showing 51-100");
  });

  it("/cmd list page 3 → shows range 101-150", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const deps = makeDeps(ui, runner, items(200));
    await dispatch("list page 3", deps);
    expect(ui.messages[0]).toContain("Showing 101-150");
  });

  it("'page' token stripped from fuzzy query", async () => {
    // /cmd list deploy page 2 → query='deploy', page=2.
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    // 60 items all named deploy-* so fuzzy 'deploy' matches all 60.
    const deployItems = Array.from({ length: 60 }, (_, i) => ({
      name: `deploy-${i}`,
      description: `deploy ${i}`,
      content: "",
      kind: "prompt" as const,
      filePath: `/p/deploy-${i}.md`,
    }));
    const deps = makeDeps(ui, runner, deployItems);
    await dispatch("list deploy page 2", deps);
    // Page 2 size 50 of 60 = items 51-60 (10 items), range 51-60.
    expect(ui.messages[0]).toContain("Showing 51-60 of 60");
  });
});

// ---------- dispatch default showAll ----------

describe("dispatch list default showAll", () => {
  it("/cmd list with no query defaults to showAll", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const deps = makeDeps(ui, runner, items(250));
    await dispatch("list", deps);
    const msg = ui.messages[0];
    // All 250 shown + 'Showing all 250' footer.
    expect(msg).toContain("item 0");
    expect(msg).toContain("item 249");
    expect(msg).toContain("Showing all 250");
  });

  it("/cmd list with no query, N below threshold, no footer", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const deps = makeDeps(ui, runner, items(100));
    await dispatch("list", deps);
    const msg = ui.messages[0];
    expect(msg).toContain("item 0");
    expect(msg).toContain("item 99");
    expect(msg).not.toContain("Showing all");
  });
});

// ---------- dispatch list with query pages at 50 ----------

describe("dispatch list with query pages at 50", () => {
  it("/cmd list <query> applies fuzzy then pages at 50", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    // 75 items all matching 'foo'.
    const fooItems = Array.from({ length: 75 }, (_, i) => ({
      name: `foo-${i}`,
      description: `foo ${i}`,
      content: "",
      kind: "prompt" as const,
      filePath: `/p/foo-${i}.md`,
    }));
    const deps = makeDeps(ui, runner, fooItems);
    await dispatch("list foo", deps);
    const msg = ui.messages[0];
    expect(msg).toContain("Showing 1-50 of 75");
    expect(msg).toContain("25 more");
    // Page 2 hint.
    expect(msg).toContain("page 2");
  });

  it("/cmd <query> (no subaction) also pages at 50", async () => {
    const ui = makeFakeUi();
    const runner = makeFakeRunner();
    const fooItems = Array.from({ length: 75 }, (_, i) => ({
      name: `foo-${i}`,
      description: `foo ${i}`,
      content: "",
      kind: "prompt" as const,
      filePath: `/p/foo-${i}.md`,
    }));
    const deps = makeDeps(ui, runner, fooItems);
    await dispatch("foo", deps);
    const msg = ui.messages[0];
    expect(msg).toContain("Showing 1-50 of 75");
  });
});
