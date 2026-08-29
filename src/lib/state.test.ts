import { describe, expect, it } from "vitest";
import { AppState } from "./state.svelte";

function wireCsPipeline(app: AppState): { timerId: number; scopeId: number } {
  const scopeId = app.nextId;
  app.addBlock("oscilloscope", 0, 0);
  const sinId = app.nextId;
  app.addBlock("sin", 180, 0);
  const quantizerId = app.nextId;
  app.addBlock("quantizer", 360, 0);
  const timerId = app.nextId;
  app.addBlock("timer", 540, 0);
  app.toggleLink(scopeId, "out", sinId, "in");
  app.toggleLink(sinId, "out", quantizerId, "consumer");
  app.toggleLink(quantizerId, "out", timerId, "consumer");
  return { timerId, scopeId };
}

describe("AppState timers", () => {
  it("keeps the same topology key when a block is only moved", () => {
    const app = new AppState();
    const { timerId } = wireCsPipeline(app);
    const before = app.timerTopologyKey();
    app.moveBlock(timerId, 40, -12);
    expect(app.timerTopologyKey()).toBe(before);
  });

  it("does not restart a running timer when a block is only moved", () => {
    const app = new AppState();
    const { timerId } = wireCsPipeline(app);
    app.reconcileTimers();
    const running = app.runFlags.get(timerId);
    expect(running?.value).toBe(true);

    app.moveBlock(timerId, 24, 16);
    app.reconcileTimers();
    expect(app.runFlags.get(timerId)).toBe(running);
    expect(running?.value).toBe(true);

    app.stopAllTimers();
  });

  it("restarts timers when the wiring changes", () => {
    const app = new AppState();
    const { timerId, scopeId } = wireCsPipeline(app);
    app.reconcileTimers();
    const running = app.runFlags.get(timerId);
    expect(running).toBeDefined();

    app.toggleLink(scopeId, "out", app.blocks.find((block) => block.defId === "sin")!.id, "in");
    app.reconcileTimers();
    expect(app.runFlags.get(timerId)).toBeUndefined();
    expect(running?.value).toBe(false);

    app.stopAllTimers();
  });
});
