import { describe, expect, it } from "vitest";
import type { Link } from "../blocks/diagram";
import { serializeCanvas } from "../diagram/json";
import { compileTypeScript } from "../tsc/emit";
import { createRuntimeHost, runCompiledDiagram } from "./host";
import { DiagramRunCancelled, DiagramRunner, EMPTY_RUN_MESSAGE } from "./diagram-runner";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gpioProductCanvas() {
  return {
    id: "diag_gpio_product",
    name: "GPIO product",
    createdAt: "2026-08-31T05:00:00Z",
    updatedAt: "2026-08-31T05:00:00Z",
    blocks: [
      { id: 1, defId: "scope", x: 0, y: 0 },
      { id: 2, defId: "overshoot", x: 120, y: 0 },
      { id: 3, defId: "product", x: 240, y: 0 },
      { id: 4, defId: "constant", x: 360, y: 0 },
      { id: 5, defId: "gpio_in", x: 360, y: 120 },
    ],
    links: [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 3, fromOut: "out[1]", toBlock: 5, toIn: "in" },
    ] satisfies Link[],
  };
}

function csPipeline(): { nodes: { id: number; defId: string }[]; links: Link[]; scopeId: number; generatorId: number } {
  const nodes = [
    { id: 1, defId: "scope" },
    { id: 2, defId: "sin" },
    { id: 3, defId: "timer" },
  ];
  const links: Link[] = [
    { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
    { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
  ];
  return { nodes, links, scopeId: 1, generatorId: 3 };
}

describe("DiagramRunner", () => {
  it("rejects a diagram with no generator path", async () => {
    const runner = new DiagramRunner();
    await expect(runner.start([], [])).rejects.toThrow(EMPTY_RUN_MESSAGE);
  });

  it("arms scopes before compile finishes and can be cancelled", async () => {
    const runner = new DiagramRunner();
    const { nodes, links, scopeId, generatorId } = csPipeline();
    const pending = runner.start(nodes, links, {
      yieldForPaint: async () => {
        expect(runner.current?.isScopeLive(scopeId)).toBe(true);
        expect(runner.current?.connectorHz(links.find((link) => link.toBlock === generatorId)!)).toBeGreaterThan(0);
        runner.stop();
      },
    });
    await expect(pending).rejects.toBeInstanceOf(DiagramRunCancelled);
    expect(runner.current).toBeNull();
  });

  it("starts generators without AppState", async () => {
    const runner = new DiagramRunner();
    const { nodes, links, scopeId } = csPipeline();
    const session = await runner.start(nodes, links, { yieldForPaint: async () => {} });
    expect(session.isScopeLive(scopeId)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const series = session.snapshotScope(scopeId);
    expect(series).toHaveLength(1);
    expect(series[0]?.samples.length).toBeGreaterThan(0);
    runner.stop();
    expect(runner.current).toBeNull();
  });

  it("runs with unused CS blocks on the canvas", async () => {
    const runner = new DiagramRunner();
    const nodes = [
      { id: 1, defId: "timer" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "cos" },
      { id: 4, defId: "random" },
      { id: 5, defId: "scope" },
    ];
    const links: Link[] = [
      { fromBlock: 5, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" },
    ];
    const session = await runner.start(nodes, links, { yieldForPaint: async () => {} });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const series = session.snapshotScope(5);
    expect(series).toHaveLength(1);
    expect(series[0]?.samples.some((value) => Number.isFinite(value))).toBe(true);
    runner.stop();
  });

  it("does not arm a fake Hertz for GPIO In", async () => {
    const runner = new DiagramRunner();
    const nodes = [
      { id: 1, defId: "gpio_out", pin: 1 },
      { id: 2, defId: "gpio_in", pin: 0 },
    ];
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const pending = runner.start(nodes, links, {
      yieldForPaint: async () => {
        expect(runner.current?.connectorHz(links[0]!)).toBe(0);
        runner.stop();
      },
    });
    await expect(pending).rejects.toBeInstanceOf(DiagramRunCancelled);
  });

  it("meters GPIO In's current pin level from start without waiting for an edge", async () => {
    const runner = new DiagramRunner();
    const nodes = [
      { id: 1, defId: "scope", windowS: 10, meterMs: 10 },
      { id: 2, defId: "gpio_in", pin: 0 },
    ];
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const session = await runner.start(nodes, links, { yieldForPaint: async () => {} });
    await new Promise((resolve) => setTimeout(resolve, 45));
    const before = session.snapshotScope(1);
    expect(before).toHaveLength(1);
    expect(before[0]?.samples.length).toBeGreaterThan(2);
    expect(before[0]?.samples.some((value) => value === 0)).toBe(true);
    runner.stop();
  });

  it("holds Constant×GPIO at zero until the pin goes high, then overshoots", async () => {
    let extra = 0;
    const scopes: number[][] = [];
    const source = serializeCanvas(gpioProductCanvas());
    expect(source).toMatch(/^type f32 = Float32Array\[1];$/m);
    const js = compileTypeScript(source);
    expect(js).toContain("overshootFromValue");
    expect(js).not.toContain("type f32");
    expect(js).not.toContain("Float32Array");
    const host = createRuntimeHost({
      connectorCount: 4,
      delayMs: 10,
      now: () => Date.now() / 1000 + extra,
      post(message) {
        if (message.type === "scope") {
          scopes.push(message.values);
        }
      },
    });
    runCompiledDiagram(js, host);
    await delay(40);
    const finiteBefore = scopes.flat().filter((value) => Number.isFinite(value));
    expect(finiteBefore.length).toBeGreaterThan(0);
    expect(finiteBefore.every((value) => Math.abs(value) < 1e-5)).toBe(true);

    host.setGpio(0, 1);
    extra = 3.63;
    await delay(30);
    const finiteAfter = scopes.flat().filter((value) => Number.isFinite(value));
    expect(finiteAfter.some((value) => value > 1.05)).toBe(true);
    host.stop();
  });

  it("compiles serialized canvas TypeScript", () => {
    const source = serializeCanvas({
      id: "diag",
      name: "Pipe",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      blocks: [
        { id: 1, defId: "scope", x: 0, y: 0 },
        { id: 2, defId: "timer", x: 180, y: 0 },
      ],
      links: [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    });
    const js = compileTypeScript(source);
    expect(js).toContain("com.dauch.cs");
    expect(js).toContain("diagram");
  });
});
