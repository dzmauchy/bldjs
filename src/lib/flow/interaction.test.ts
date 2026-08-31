import { describe, expect, it, vi } from "vitest";
import { AppState } from "$lib/state";
import { DiagramInteractionController, LINK_DRAG } from "./interaction";
import type { Point } from "./geometry";

function pointer(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    isPrimary: true,
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 20,
    pointerType: "mouse",
    preventDefault() {},
    stopPropagation() {},
    composedPath: () => [],
    ...overrides,
  } as PointerEvent;
}

describe("DiagramInteractionController", () => {
  it("pans, moves a block, and starts a link session", () => {
    const app = new AppState();
    app.addBlock("timer", 0, 0);
    const id = app.blocks[0]!.id;
    let world: Point | undefined = { x: 4, y: 6 };
    const host = {
      app,
      toWorld: () => world,
      viewportElement: () => null,
      requestUpdate: vi.fn(),
    };
    const interaction = new DiagramInteractionController(host);

    interaction.onViewportPointerDown(pointer({ clientX: 40, clientY: 50 }));
    expect(interaction.session?.kind).toBe("pan");
    interaction.onPointerMove(pointer({ clientX: 46, clientY: 53 }));
    expect(app.panX).toBe(54);
    expect(app.panY).toBe(51);

    interaction.endPointer();
    const node = document.createElement("bld-node");
    node.dataset.blockId = String(id);
    interaction.onViewportPointerDown(
      pointer({
        clientX: 8,
        clientY: 9,
        composedPath: () => [node],
      }),
    );
    expect(interaction.session).toMatchObject({ kind: "move", id });
    expect(app.selected).toBe(id);
    interaction.onPointerMove(pointer({ clientX: 18, clientY: 9 }));
    expect(app.block(id)?.x).toBe(10);

    interaction.endPointer();
    interaction.onPortDown({
      side: "out",
      blockId: id,
      port: "out",
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
    expect(app.linkingFrom).toEqual({ blockId: id, port: "out" });
    expect(interaction.session?.kind).toBe("link");
    expect(interaction.previewTo).toEqual(world);
    interaction.onPointerMove(pointer({ clientX: LINK_DRAG + 1, clientY: 0, pointerId: 1 }));
    expect(interaction.session).toMatchObject({ kind: "link", dragged: true });
    interaction.endPointer();
  });

  it("keeps panning when pointer capture is lost while the finger is down", () => {
    const app = new AppState();
    const host = {
      app,
      toWorld: () => ({ x: 0, y: 0 }),
      viewportElement: () => null,
      requestUpdate: vi.fn(),
    };
    const interaction = new DiagramInteractionController(host);
    interaction.onViewportPointerDown(pointer({ clientX: 40, clientY: 50 }));
    expect(interaction.session?.kind).toBe("pan");
    interaction.onLostPointerCapture(pointer({ clientX: 40, clientY: 50, buttons: 1 }));
    expect(interaction.session?.kind).toBe("pan");
    interaction.onPointerMove(pointer({ clientX: 52, clientY: 58, buttons: 1 }));
    expect(app.panX).toBe(60);
    expect(app.panY).toBe(56);
    interaction.endPointer();
  });

  it("connects a dragged wire dropped on a block with one compatible input", () => {
    const app = new AppState();
    app.addBlock("sin", 0, 0);
    app.addBlock("timer", 240, 0);
    const sinId = app.blocks.find((block) => block.defId === "sin")!.id;
    const timerId = app.blocks.find((block) => block.defId === "timer")!.id;
    const host = {
      app,
      toWorld: () => ({ x: 0, y: 0 }),
      viewportElement: () => null,
      requestUpdate: vi.fn(),
    };
    const interaction = new DiagramInteractionController(host);
    interaction.onPortDown({
      side: "out",
      blockId: sinId,
      port: "out",
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
    interaction.onPointerMove(pointer({ clientX: LINK_DRAG + 4, clientY: 0, pointerId: 1 }));
    const timer = document.createElement("bld-node");
    timer.dataset.blockId = String(timerId);
    interaction.onPointerUp(pointer({ clientX: 80, clientY: 40, pointerId: 1, composedPath: () => [timer] }));
    expect(app.links).toEqual([
      expect.objectContaining({ fromBlock: sinId, fromOut: "out", toBlock: timerId, toIn: "in" }),
    ]);
    expect(app.linkingFrom).toBeNull();
  });

  it("does not start a move when tapping a block while a wire is in progress", () => {
    const app = new AppState();
    app.addBlock("sin", 0, 0);
    app.addBlock("timer", 240, 0);
    const sinId = app.blocks.find((block) => block.defId === "sin")!.id;
    const timerId = app.blocks.find((block) => block.defId === "timer")!.id;
    const host = {
      app,
      toWorld: () => ({ x: 0, y: 0 }),
      viewportElement: () => null,
      requestUpdate: vi.fn(),
    };
    const interaction = new DiagramInteractionController(host);
    app.linkingFrom = { blockId: sinId, port: "out" };
    const timer = document.createElement("bld-node");
    timer.dataset.blockId = String(timerId);
    interaction.onViewportPointerDown(pointer({ composedPath: () => [timer] }));
    expect(interaction.session).toBeNull();
    expect(app.block(timerId)?.x).toBe(240);
  });
});
