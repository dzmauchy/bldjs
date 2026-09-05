import { describe, expect, it } from "vitest";
import type { Link } from "@bld/xml/blocks/diagram";
import { DiagramRunCancelled, DiagramRunner, EMPTY_RUN_MESSAGE } from "./diagram-runner";

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

  it("arms scopes before WASM finishes and can be cancelled", async () => {
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
    expect(session.generators.size).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const series = await session.snapshotScope(scopeId);
    expect(series).toHaveLength(1);
    expect(series[0]?.samples.length).toBeGreaterThan(0);
    runner.stop();
    expect(runner.current).toBeNull();
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
    session.setGpio(0, 1);
    session.tick(2);
    await new Promise((resolve) => setTimeout(resolve, 35));
    const after = session.snapshotScope(1);
    expect(after[0]?.samples.some((value) => value === 1)).toBe(true);
    expect(after[0]?.samples.some((value) => value === 0)).toBe(true);
    runner.stop();
  });

  it("drops connector Hertz to zero when the GPIO value stops changing", async () => {
    const runner = new DiagramRunner();
    const nodes = [
      { id: 1, defId: "gpio_out", pin: 1 },
      { id: 2, defId: "gpio_in", pin: 0 },
    ];
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const session = await runner.start(nodes, links, { yieldForPaint: async () => {} });
    const t0 = 1_000;
    session.sampleFlowRates(t0);
    session.setGpio(0, 1);
    session.tick(2);
    session.sampleFlowRates(t0 + 50);
    expect(session.connectorHz(links[0]!)).toBeGreaterThan(0);
    session.sampleFlowRates(t0 + 150);
    expect(session.connectorHz(links[0]!)).toBe(0);
    runner.stop();
  });

  it("shows exactly one scope plot and generates overshoot signal on switching GPIO In with Product and Constant", async () => {
    const runner = new DiagramRunner();
    const nodes = [
      { id: 1, defId: "scope", windowS: 10, meterMs: 10 },
      { id: 2, defId: "overshoot", zeta: 0.5, omega: 20 },
      { id: 3, defId: "product", count: 2, def: 1 },
      { id: 4, defId: "gpio_in", pin: 0 },
      { id: 5, defId: "constant", value: 1, periodMs: 10 },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 3, fromOut: "out[1]", toBlock: 5, toIn: "in" },
    ];
    const session = await runner.start(nodes, links, { yieldForPaint: async () => {} });

    // Assert Scope has exactly one channel (not two duplicate channels)
    const scopeChannels = session.snapshotScope(1);
    expect(scopeChannels).toHaveLength(1);
    expect(scopeChannels[0]?.label).toBe("overshoot");

    // Wait for initial baseline samples (GPIO is initially 0, so product is 0)
    await new Promise((resolve) => setTimeout(resolve, 40));
    const initialSamples = session.snapshotScope(1)[0]?.samples ?? [];
    expect(initialSamples.length).toBeGreaterThan(0);
    expect(initialSamples.some((val) => val === 0)).toBe(true);

    // Switch GPIO In to 1 (button clicked in UI)
    session.setGpio(0, 1);
    session.tick(4);

    // Wait for overshoot transition to evolve (~220ms with omega=20)
    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterSamples = session.snapshotScope(1)[0]?.samples ?? [];

    // The overshoot signal must rise and exceed 1.0 (classic second-order underdamped response)
    expect(afterSamples.some((val) => val > 1.05)).toBe(true);

    runner.stop();
  });
});
