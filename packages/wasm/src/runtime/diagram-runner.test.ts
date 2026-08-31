import { describe, expect, it } from "vitest";
import type { Link } from "@bld/xml";
import { DiagramRunCancelled, DiagramRunner, EMPTY_RUN_MESSAGE } from "./diagram-runner";

function csPipeline(): { nodes: { id: number; defId: string }[]; links: Link[]; scopeId: number; timerId: number } {
  const nodes = [
    { id: 1, defId: "scope" },
    { id: 2, defId: "quantizer" },
    { id: 3, defId: "sin" },
    { id: 4, defId: "timer" },
  ];
  const links: Link[] = [
    { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
    { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
  ];
  return { nodes, links, scopeId: 1, timerId: 4 };
}

describe("DiagramRunner", () => {
  it("rejects a diagram with no timer path", async () => {
    const runner = new DiagramRunner();
    await expect(runner.start([], [])).rejects.toThrow(EMPTY_RUN_MESSAGE);
  });

  it("arms scopes before WASM finishes and can be cancelled", async () => {
    const runner = new DiagramRunner();
    const { nodes, links, scopeId, timerId } = csPipeline();
    const pending = runner.start(nodes, links, {
      yieldForPaint: async () => {
        expect(runner.current?.isScopeLive(scopeId)).toBe(true);
        expect(runner.current?.connectorHz(links.find((link) => link.toBlock === timerId)!)).toBeGreaterThan(0);
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
});
