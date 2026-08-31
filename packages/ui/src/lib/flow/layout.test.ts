import { describe, expect, it } from "vitest";
import { portFromClientPoint, nodeFromComposedPath, worldPort } from "./layout";
import type { NodeLayout } from "./types";

describe("node layout", () => {
  const layout: NodeLayout = {
    width: 180,
    height: 90,
    ports: {
      in: { elements: { x: 6, y: 48 } },
      out: { value: { x: 174, y: 40 } },
    },
  };

  it("maps a local port onto the node's world origin", () => {
    expect(worldPort({ x: 100, y: 20 }, layout, "out", "value")).toEqual({ x: 274, y: 60 });
    expect(worldPort({ x: 100, y: 20 }, layout, "in", "elements")).toEqual({ x: 106, y: 68 });
  });

  it("follows node movement without remeasuring the handle", () => {
    const before = worldPort({ x: 0, y: 0 }, layout, "out", "value")!;
    const after = worldPort({ x: 40, y: -12 }, layout, "out", "value")!;
    expect(after.x - before.x).toBe(40);
    expect(after.y - before.y).toBe(-12);
  });

  it("returns undefined until the custom element has reported a size", () => {
    expect(worldPort({ x: 0, y: 0 }, undefined, "out", "value")).toBeUndefined();
    expect(worldPort(undefined, layout, "out", "value")).toBeUndefined();
  });

  it("finds no port when the client point misses every handle", () => {
    expect(portFromClientPoint(-4000, -4000)).toBeUndefined();
  });

  it("finds a node host in the composed path", () => {
    const node = document.createElement("bld-node");
    const inner = document.createElement("div");
    expect(nodeFromComposedPath({ composedPath: () => [inner, node] } as unknown as Event)).toBe(node);
    expect(nodeFromComposedPath({ composedPath: () => [inner] } as unknown as Event)).toBeUndefined();
  });
});
