import { describe, expect, it } from "vitest";
import { DiagramModel } from "./diagram-model";

describe("DiagramModel", () => {
  it("indexes blocks by id", () => {
    const diagram = new DiagramModel();
    const timer = diagram.add("timer", 0, 0);
    const sin = diagram.add("sin", 40, 8);
    expect(diagram.block(timer.id)).toEqual(timer);
    expect(diagram.block(sin.id)?.defId).toBe("sin");
    diagram.moveBy(timer.id, 10, -4);
    expect(diagram.block(timer.id)).toEqual({ id: timer.id, defId: "timer", x: 10, y: -4 });
    expect(diagram.remove(sin.id)).toBe(true);
    expect(diagram.block(sin.id)).toBeUndefined();
    expect(diagram.blocks.map((block) => block.defId)).toEqual(["timer"]);
  });
});
