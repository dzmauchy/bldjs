import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { blockSignature, wasmValType } from "./signatures";
import { named, generic } from "../blocks/ast";

describe("XML ↔ WASM signatures", () => {
  it("maps catalog primitives and typed functions", () => {
    expect(wasmValType(named("f64"))).toBe("f64");
    expect(wasmValType(named("i32"))).toBe("i32");
    expect(wasmValType(generic("func", [named("f64")]))).toBe("(ref $fn_f64)");
    expect(wasmValType(generic("table", [named("i32")]))).toBe("(ref $table_i32)");
  });

  it("control-system blocks match WASM params and results", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();

    expect(blockSignature(cat.block("timer")!)).toEqual({
      id: "timer",
      name: "Timer",
      params: [],
      results: [{ name: "out", type: "f64" }],
    });
    expect(blockSignature(cat.block("quantizer")!)).toEqual({
      id: "quantizer",
      name: "Quantizer",
      params: [{ name: "in", type: "f64" }],
      results: [{ name: "out", type: "f64" }],
    });
    expect(blockSignature(cat.block("sin")!)).toEqual({
      id: "sin",
      name: "Sin",
      params: [{ name: "in", type: "f64" }],
      results: [{ name: "out", type: "f64" }],
    });
    expect(blockSignature(cat.block("oscilloscope")!)).toEqual({
      id: "oscilloscope",
      name: "Oscilloscope",
      params: [{ name: "in", type: "f64" }],
      results: [],
    });
  });

  it("wasm.xml blocks use arguments as inputs and results as outputs", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();

    expect(blockSignature(cat.block("b_f64")!)).toEqual({
      id: "b_f64",
      name: "f64",
      params: [],
      results: [{ name: "value", type: "f64" }],
    });
    expect(blockSignature(cat.block("b_table_get")!)).toEqual({
      id: "b_table_get",
      name: "table.get",
      params: [
        { name: "table", type: "(ref $table_T)" },
        { name: "index", type: "i32" },
      ],
      results: [{ name: "elem", type: "externref" }],
    });
    expect(blockSignature(cat.block("b_func")!).params[0]?.type).toBe("(ref $fn_T)");
    expect(blockSignature(cat.block("b_func")!).results[0]?.type).toBe("(ref $fn_T)");
  });
});
