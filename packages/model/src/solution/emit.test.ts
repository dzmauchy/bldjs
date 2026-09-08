import { describe, expect, it } from "vitest";
import { MODEL_TS } from "../blocks/builtin";
import { serializeCanvas, parseDiagram } from "../diagram/json";
import { emitDiagramStart } from "./emit";

describe("diagram TypeScript emit", () => {
  it("emits CS wiring for scope → sin → timer", () => {
    const start = emitDiagramStart({
      blocks: [
        { id: 1, defId: "scope", x: 0, y: 0 },
        { id: 2, defId: "sin", x: 180, y: 0 },
        { id: 3, defId: "timer", x: 360, y: 0 },
      ],
      links: [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      ],
    });
    expect(start).toContain("com.dauch.cs.sink.scope(30, 10)");
    expect(start).toContain("com.dauch.cs.tf.sin(");
    expect(start).toContain("com.dauch.cs.gen.timer(10,");
    expect(start).toContain("tap(0,");
    expect(start).toContain("b1s0");
    expect(start).toContain("slot(b1, 0)");
  });

  it("uses host time for overshoot when the generator is not a timer", () => {
    const start = emitDiagramStart({
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
      ],
    });
    expect(start).toContain("overshootFromValue(");
    expect(start).not.toContain("com.dauch.cs.tf.overshoot(");
    expect(start).toContain("const b3s0 = slot(b3, 0)");
    expect(start).toContain("const b3s1 = slot(b3, 1)");
    expect(start).toContain("tap(2, b3s0)");
    expect(start).toContain("tap(3, b3s1)");
  });

  it("serializes a self-contained diagram with decorator defs and start()", () => {
    const source = serializeCanvas({
      id: "diag_cs",
      name: "CS pipeline",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:30:00Z",
      catalogs: ["model.ts"],
      blocks: [
        { id: 1, defId: "scope", x: 0, y: 0 },
        { id: 2, defId: "timer", x: 180, y: 0 },
      ],
      links: [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    });
    expect(MODEL_TS).toContain("function Diagram(");
    expect(MODEL_TS).toContain("type f32 = Float32Array[1]");
    expect(MODEL_TS).toContain("type Multiplexed<T> = T[]");
    expect(source).toContain("@Diagram(");
    expect(source).toContain('caption');
    expect(source).toContain("com.dauch.cs.sink.scope");
    expect(source).toContain("diagram();");
    const parsed = parseDiagram(source);
    expect(parsed.blocks.map((block) => block.defId)).toEqual(["scope", "timer"]);
    expect(parsed.links).toHaveLength(1);
  });
});
