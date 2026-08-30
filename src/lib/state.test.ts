import { describe, expect, it } from "vitest";
import { BLOCK_PLACE_HEIGHT, BLOCK_PLACE_WIDTH } from "./model";
import { AppState } from "./state";

function wireCsPipeline(app: AppState): { timerId: number; scopeId: number } {
  const timerId = app.nextId;
  app.addBlock("timer", 0, 0);
  const quantizerId = app.nextId;
  app.addBlock("quantizer", 180, 0);
  const sinId = app.nextId;
  app.addBlock("sin", 360, 0);
  const scopeId = app.nextId;
  app.addBlock("oscilloscope", 540, 0);
  app.toggleLink(timerId, "out", quantizerId, "in");
  app.toggleLink(quantizerId, "out", sinId, "in");
  app.toggleLink(sinId, "out", scopeId, "in");
  return { timerId, scopeId };
}

describe("AppState placement", () => {
  it("tiles double-clicked blocks so they do not overlap", () => {
    const app = new AppState();
    app.viewportW = 800;
    app.viewportH = 600;
    app.addBlockAtViewCenter("oscilloscope");
    app.addBlockAtViewCenter("quantizer");
    app.addBlockAtViewCenter("sin");
    app.addBlockAtViewCenter("timer");
    for (let i = 0; i < app.blocks.length; i++) {
      for (let j = i + 1; j < app.blocks.length; j++) {
        const a = app.blocks[i];
        const b = app.blocks[j];
        const overlapX = Math.abs(a.x - b.x) < BLOCK_PLACE_WIDTH;
        const overlapY = Math.abs(a.y - b.y) < BLOCK_PLACE_HEIGHT;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });
});

describe("AppState wiring", () => {
  it("keeps multiple c<f64> wires on the oscilloscope vararg input", () => {
    const app = new AppState();
    const timerId = app.nextId;
    app.addBlock("timer", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 180, 0);
    const cosId = app.nextId;
    app.addBlock("cos", 180, 120);
    const scopeId = app.nextId;
    app.addBlock("oscilloscope", 360, 0);
    app.toggleLink(timerId, "out", sinId, "in");
    app.toggleLink(timerId, "out", cosId, "in");
    app.toggleLink(sinId, "out", scopeId, "in");
    app.toggleLink(cosId, "out", scopeId, "in");
    expect(app.links).toEqual([
      { fromBlock: timerId, fromOut: "out", toBlock: sinId, toIn: "in" },
      { fromBlock: timerId, fromOut: "out", toBlock: cosId, toIn: "in" },
      { fromBlock: sinId, fromOut: "out", toBlock: scopeId, toIn: "in" },
      { fromBlock: cosId, fromOut: "out", toBlock: scopeId, toIn: "in" },
    ]);
    expect(app.canRun()).toBe(true);
    expect(app.plannedGenerators()[0].channels).toEqual([
      { scopeId, label: "sin" },
      { scopeId, label: "cos" },
    ]);
  });

  it("grounds timer into quantizer", () => {
    const app = new AppState();
    const timerId = app.nextId;
    app.addBlock("timer", 0, 0);
    const quantizerId = app.nextId;
    app.addBlock("quantizer", 300, 0);
    app.toggleLink(timerId, "out", quantizerId, "in");
    expect(app.links).toEqual([
      { fromBlock: timerId, fromOut: "out", toBlock: quantizerId, toIn: "in" },
    ]);
  });

  it("deletes a selected connector without removing blocks", () => {
    const app = new AppState();
    const timerId = app.nextId;
    app.addBlock("timer", 0, 0);
    const quantizerId = app.nextId;
    app.addBlock("quantizer", 300, 0);
    app.toggleLink(timerId, "out", quantizerId, "in");
    app.selectLink({ fromBlock: timerId, fromOut: "out", toBlock: quantizerId, toIn: "in" });
    app.deleteSelected();
    expect(app.links).toEqual([]);
    expect(app.blocks).toHaveLength(2);
    expect(app.selectedLink).toBeNull();
  });

  it("removes a block and its links", () => {
    const app = new AppState();
    const timerId = app.nextId;
    app.addBlock("timer", 0, 0);
    const quantizerId = app.nextId;
    app.addBlock("quantizer", 300, 0);
    app.toggleLink(timerId, "out", quantizerId, "in");
    app.removeBlock(timerId);
    expect(app.blocks.map((block) => block.defId)).toEqual(["quantizer"]);
    expect(app.links).toEqual([]);
  });
});

describe("AppState run", () => {
  it("keeps the same topology key when a block is only moved", () => {
    const app = new AppState();
    const { timerId } = wireCsPipeline(app);
    const before = app.timerTopologyKey();
    app.moveBlock(timerId, 40, -12);
    expect(app.timerTopologyKey()).toBe(before);
  });

  it("does not start generators until Run", () => {
    const app = new AppState();
    const { scopeId } = wireCsPipeline(app);
    expect(app.running).toBe(false);
    expect(app.canRun()).toBe(true);
    expect(app.isScopeLive(scopeId)).toBe(false);
    app.openOscilloscope(scopeId);
    expect(app.scopeOpen).toBe(-1);
  });

  it("run compiles wasm and enables the oscilloscope chart", async () => {
    const app = new AppState();
    const { timerId, scopeId } = wireCsPipeline(app);
    await app.runDiagram();
    expect(app.running).toBe(true);
    expect(app.runError).toBeNull();
    expect(app.isScopeLive(scopeId)).toBe(true);
    app.openOscilloscope(scopeId);
    expect(app.scopeOpen).toBe(scopeId);

    app.moveBlockTo(timerId, 24, 16);
    expect(app.running).toBe(true);
    expect(app.isScopeLive(scopeId)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const series = await app.snapshotScope(scopeId);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe("quantizer → sin");
    expect(series[0].samples.length).toBeGreaterThan(0);
    app.stopRun();
    expect(app.running).toBe(false);
    expect(app.isScopeLive(scopeId)).toBe(false);
  });

  it("run snapshots two series for a vararg oscilloscope", async () => {
    const app = new AppState();
    const timerId = app.nextId;
    app.addBlock("timer", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 180, 0);
    const cosId = app.nextId;
    app.addBlock("cos", 180, 120);
    const scopeId = app.nextId;
    app.addBlock("oscilloscope", 360, 0);
    app.toggleLink(timerId, "out", sinId, "in");
    app.toggleLink(timerId, "out", cosId, "in");
    app.toggleLink(sinId, "out", scopeId, "in");
    app.toggleLink(cosId, "out", scopeId, "in");
    await app.runDiagram();
    expect(app.running).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const series = await app.snapshotScope(scopeId);
    expect(series.map((channel) => channel.label)).toEqual(["sin", "cos"]);
    expect(series[0].samples.length).toBeGreaterThan(0);
    expect(series[1].samples.length).toBeGreaterThan(0);
    app.stopRun();
  });

  it("stops the run when the wiring changes", async () => {
    const app = new AppState();
    const { timerId, scopeId } = wireCsPipeline(app);
    await app.runDiagram();
    expect(app.running).toBe(true);

    app.toggleLink(app.blocks.find((block) => block.defId === "sin")!.id, "out", scopeId, "in");
    expect(app.running).toBe(false);
    expect(app.canRun()).toBe(false);
    expect(timerId).toBeGreaterThan(0);
  });
});
