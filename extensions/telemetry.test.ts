/**
 * telemetry.test.ts — RED phase: asserts cmd_read telemetry events.
 *
 * These tests currently FAIL because:
 *   - `TelemetryEvent` type is not exported from dispatch.ts
 *   - `DispatchDeps.telemetry` field does not exist
 *   - `dispatchForTool` 4th telemetry param does not exist
 *
 * GREEN phase will add those without changing existing behaviour.
 */
import { describe, it, expect } from "vitest";
import {
  dispatch,
  dispatchForTool,
  type DispatchDeps,
  type DispatchUi,
  type DispatchRunner,
  type TelemetryEvent,
} from "./dispatch.ts";
import type { PaletteItem } from "./discovery.ts";

/** Build a fake UI that records notify calls (no interactive input/select). */
function makeFakeUi(): DispatchUi & {
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    notify(message: string, level?: "info" | "warning" | "error") {
      calls.push({ method: "notify", args: [message, level] });
    },
    input: async () => undefined,
    select: async () => undefined,
  };
}

/** Build a fake runner (unused for read, but required by DispatchDeps). */
function makeFakeRunner(): DispatchRunner {
  return { run: () => {} };
}

/** Build deps with an OPTIONAL telemetry sink that records events. */
function makeDeps(opts: {
  items: PaletteItem[];
  telemetry?: (event: TelemetryEvent) => void;
  hasUI?: boolean;
}): DispatchDeps {
  return {
    hasUI: opts.hasUI ?? false,
    getItems: () => opts.items,
    ui: makeFakeUi(),
    runner: makeFakeRunner(),
    telemetry: opts.telemetry,
  };
}

/** Sample items mirror dispatch.test.ts sampleItems(). */
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

describe("telemetry — /cmd read success", () => {
  it("emits ONE cmd_read event with name, kind, source for a prompt", async () => {
    const events: TelemetryEvent[] = [];
    const deps = makeDeps({
      items: sampleItems(),
      telemetry: (e) => events.push(e),
    });

    await dispatch("read deploy", deps);

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("cmd_read");
    expect(events[0].name).toBe("deploy");
    expect(events[0].kind).toBe("prompt");
    expect(events[0].source).toBe("/p/deploy.md");
  });

  it("emits event with kind=skill and the skill file path", async () => {
    const events: TelemetryEvent[] = [];
    const deps = makeDeps({
      items: sampleItems(),
      telemetry: (e) => events.push(e),
    });

    await dispatch("read audit-skill", deps);

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("audit-skill");
    expect(events[0].kind).toBe("skill");
    expect(events[0].source).toBe("/s/audit-skill/SKILL.md");
  });

  it("emits source='runtime' for items without a filePath", async () => {
    const events: TelemetryEvent[] = [];
    const deps = makeDeps({
      items: sampleItems(),
      telemetry: (e) => events.push(e),
    });

    await dispatch("read enforcer-status", deps);

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("enforcer-status");
    expect(events[0].kind).toBe("command");
    expect(events[0].source).toBe("runtime");
  });

  it("includes an ISO 8601 timestamp in the `at` field", async () => {
    const before = Date.now();
    const events: TelemetryEvent[] = [];
    const deps = makeDeps({
      items: sampleItems(),
      telemetry: (e) => events.push(e),
    });

    await dispatch("read deploy", deps);
    const after = Date.now();

    expect(events).toHaveLength(1);
    const ts = Date.parse(events[0].at);
    // Valid ISO date, within the [before, after] window.
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("telemetry — read miss", () => {
  it("does NOT emit telemetry when the name is unknown", async () => {
    const events: TelemetryEvent[] = [];
    const deps = makeDeps({
      items: sampleItems(),
      telemetry: (e) => events.push(e),
    });

    await dispatch("read does-not-exist", deps);

    expect(events).toHaveLength(0);
  });
});

describe("telemetry — optional sink", () => {
  it("does NOT throw when telemetry is undefined (backward compatible)", async () => {
    const deps = makeDeps({ items: sampleItems() }); // no telemetry key

    await expect(dispatch("read deploy", deps)).resolves.toBeDefined();
  });
});

describe("telemetry — tool path (dispatchForTool)", () => {
  it("emits a cmd_read event when called via the tool read subaction", async () => {
    const events: TelemetryEvent[] = [];
    const runner = makeFakeRunner();

    await dispatchForTool(
      { subaction: "read", name: "deploy" },
      sampleItems(),
      runner,
      (e) => events.push(e),
    );

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("cmd_read");
    expect(events[0].name).toBe("deploy");
    expect(events[0].kind).toBe("prompt");
    expect(events[0].source).toBe("/p/deploy.md");
  });

  it("does NOT emit telemetry on a tool-path read miss", async () => {
    const events: TelemetryEvent[] = [];
    const runner = makeFakeRunner();

    await dispatchForTool(
      { subaction: "read", name: "nope" },
      sampleItems(),
      runner,
      (e) => events.push(e),
    );

    expect(events).toHaveLength(0);
  });

  it("works without a telemetry sink (4th param optional)", async () => {
    const runner = makeFakeRunner();
    await expect(
      dispatchForTool({ subaction: "read", name: "deploy" }, sampleItems(), runner),
    ).resolves.toBeDefined();
  });
});
