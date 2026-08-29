import { describe, expect, it } from "vitest";
import { BLOCK_HEIGHT, BLOCK_WIDTH } from "./model";
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

describe("AppState placement", () => {
  it("tiles double-clicked blocks so they do not overlap", () => {
    const app = new AppState();
    app.viewportW = 800;
    app.viewportH = 600;
    app.addBlockAtViewCenter("b_string");
    app.addBlockAtViewCenter("b_list_of");
    app.addBlockAtViewCenter("sin");
    app.addBlockAtViewCenter("timer");
    for (let i = 0; i < app.blocks.length; i++) {
      for (let j = i + 1; j < app.blocks.length; j++) {
        const a = app.blocks[i];
        const b = app.blocks[j];
        const overlapX = Math.abs(a.x - b.x) < BLOCK_WIDTH;
        const overlapY = Math.abs(a.y - b.y) < BLOCK_HEIGHT;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });
});

describe("AppState wiring", () => {
  it("grounds List.of from String", () => {
    const app = new AppState();
    const stringId = app.nextId;
    app.addBlock("b_string", 0, 0);
    const listId = app.nextId;
    app.addBlock("b_list_of", 300, 0);
    app.toggleLink(stringId, "value", listId, "elements");
    expect(app.links).toEqual([
      { fromBlock: stringId, fromOut: "value", toBlock: listId, toIn: "elements" },
    ]);
  });

  it("removes a block and its links", () => {
    const app = new AppState();
    const stringId = app.nextId;
    app.addBlock("b_string", 0, 0);
    const listId = app.nextId;
    app.addBlock("b_list_of", 300, 0);
    app.toggleLink(stringId, "value", listId, "elements");
    app.removeBlock(stringId);
    expect(app.blocks.map((block) => block.defId)).toEqual(["b_list_of"]);
    expect(app.links).toEqual([]);
  });
});

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

    app.moveBlockTo(timerId, 24, 16);
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
