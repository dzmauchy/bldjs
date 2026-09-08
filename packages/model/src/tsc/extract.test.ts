import { describe, expect, it } from "vitest";
import { displayType } from "@bld/types/ast";
import { createTscContext } from "./host";
import { extractCatalog } from "./extract";
import { desugarFunctionDecorators } from "./desugar";
import { hydrateBlocksDoc, serializeBlocksDoc } from "../blocks/serialize";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sample = `
function Type(meta: object): void { void meta; }
function Namespace(meta: object): (target: Function) => void { return (target) => target; }
function Catalog(meta: object): (target: Function) => void { return (target) => target; }
function Block(meta: object): <T>(fn: T) => T { return (fn) => fn; }
function Inputs(meta: object): <T>(fn: T) => T { return (fn) => fn; }
function Outputs(meta: object): <T>(fn: T) => T { return (fn) => fn; }
function Params(meta: object): <T>(fn: T) => T { return (fn) => fn; }

interface Float32Array { readonly [index: number]: number; }
interface Float64Array { readonly [index: number]: number; }

@Catalog({ id: "cs", name: "Control Systems" })
class _catalog {}

Type({ name: "f32", icon: "f32" });
type f32 = Float32Array[1];

Type({ name: "f64", icon: "f64" });
type f64 = Float64Array[1];

type c<T> = (arg: T) => void;
type Multiplexed<T> = T[];

namespace com.dauch.cs {
  @Namespace({ name: "Control Systems" })
  class _ns {}
  namespace gen {
    @Namespace({ name: "Gen" })
    class _ns {}
    @Block({ name: "Timer", icon: "timer", kind: "Start", runnable: true, generator: true, factory: "timer" })
    @Inputs({ in: { name: "in" } })
    @Params({ period: { kind: "integer-range-parameter", name: "period", min: 1, max: 1000, step: 1, default: "10" } })
    function timer(period: number, inp: c<f32>): void {}
  }
  namespace sink {
    @Namespace({ name: "Sink" })
    class _ns {}
    @Block({ name: "Scope", icon: "scope", kind: "Output", factory: "scope" })
    @Outputs({ out: { name: "out", attrs: { dynamic: "true" } } })
    @Params({
      n: { kind: "integer-range-parameter", name: "n", default: "30", min: 10, max: 600 },
      m: { kind: "integer-range-parameter", name: "m", default: "10", min: 10, max: 1000 },
    })
    function scope(n: number, m: number): Multiplexed<c<f32>> { return []; }
  }
}
`;

describe("TypeScript 7.0.2 catalog extract", () => {
  it("desugars function decorators", () => {
    const out = desugarFunctionDecorators(`
@Block({ name: "Timer" })
@Inputs({ in: { name: "in" } })
function timer(period: number, inp: c<f32>): void {}
`);
    expect(out).toContain("function timer(");
    expect(out).toContain("Block({ name: \"Timer\" })(Inputs({ in: { name: \"in\" } })(timer));");
    expect(out).not.toMatch(/@Block/);
  });

  it("extracts typed-array aliases, namespaces, and CS blocks", () => {
    const ctx = createTscContext([{ name: "model.ts", content: sample }]);
    try {
      const doc = extractCatalog(ctx, "model.ts");
      expect(doc.id).toBe("cs");
      expect(doc.name).toBe("Control Systems");
      expect(doc.types.map((item) => item.name)).toEqual(expect.arrayContaining(["f32", "f64", "c"]));
      expect(doc.namespaces.map((item) => item.id).sort()).toEqual(["com.dauch.cs", "com.dauch.cs.gen", "com.dauch.cs.sink"]);
      expect(doc.namespaces.find((item) => item.id === "com.dauch.cs")?.name).toBe("Control Systems");
      const timer = doc.blocks.find((block) => block.id === "timer");
      const scope = doc.blocks.find((block) => block.id === "scope");
      expect(timer?.ns).toBe("com.dauch.cs.gen");
      expect(timer?.name).toBe("Timer");
      expect(timer?.parameters[0]?.name).toBe("period");
      expect(timer?.parameters[0]?.default).toBe("10");
      expect(displayType(timer!.inputs[0]!.ty, true)).toBe("(f32) -> void");
      expect(sample).toContain("type f32 = Float32Array[1]");
      expect(timer?.outputs).toEqual([]);
      expect(scope?.ns).toBe("com.dauch.cs.sink");
      expect(displayType(scope!.outputs[0]!.ty, true)).toBe("Array[(f32) -> void]");
      expect(scope?.outputs[0]?.attributes.find((item) => item.name === "dynamic")?.value).toBe("true");
      expect(ctx.isTypeAssignableTo(ctx.typeFromText("f32")!, ctx.typeFromText("f64")!)).toBe(true);
    } finally {
      ctx.dispose();
    }
  });

  it("extracts model.ts and round-trips serialized BlocksDoc", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../resources/models/model.ts", import.meta.url)),
      "utf8",
    );
    const ctx = createTscContext([{ name: "model.ts", content: source }]);
    try {
      const doc = extractCatalog(ctx, "model.ts");
      expect(doc.id).toBe("cs");
      expect(doc.name).toBe("Control Systems");
      expect(doc.blocks.map((block) => block.id).sort()).toEqual([
        "constant",
        "cos",
        "gpio_in",
        "gpio_out",
        "overshoot",
        "product",
        "random",
        "scope",
        "sin",
        "timer",
      ]);
      const hydrated = hydrateBlocksDoc(serializeBlocksDoc(doc));
      expect(hydrated.id).toBe(doc.id);
      expect(hydrated.blocks.map((block) => block.id)).toEqual(doc.blocks.map((block) => block.id));
      const timer = hydrated.blocks.find((block) => block.id === "timer");
      expect(displayType(timer!.inputs[0]!.ty, true)).toBe("(f32) -> void");
      expect(source).toContain("type f32 = Float32Array[1]");
      expect(source).toContain("type Multiplexed<T> = T[]");
    } finally {
      ctx.dispose();
    }
  });
});
