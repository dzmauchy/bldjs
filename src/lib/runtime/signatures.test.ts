import { describe, expect, it } from "vitest";
import { associateBuiltinModels, associateFixtureModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { asIdent, asSignature, asValType, blockSignature, wasmHeapTypeName } from "./signatures";
import { arrayOf, displayType, named, generic } from "../blocks/ast";

describe("XML ↔ AssemblyScript signatures", () => {
  it("maps catalog primitives and function types to aliases", () => {
    expect(asValType(named("f64"))).toBe("f64");
    expect(asValType(named("i32"))).toBe("i32");
    expect(asValType(named("bool"))).toBe("bool");
    expect(asValType(named("str"))).toBe("string");
    expect(asValType(generic("c1", [named("f64")]))).toBe("c<f64>");
    expect(asValType(generic("s", [named("f64")]))).toBe("s<f64>");
    expect(asValType(generic("f1", [named("i32"), named("str")]))).toBe("f1<i32, string>");
    expect(asValType(generic("c2", [named("i32"), named("f64")]))).toBe("c2<i32, f64>");
    expect(asValType(generic("f2", [named("i32"), named("i64"), named("bool")]))).toBe(
      "f2<i32, i64, bool>",
    );
    expect(asValType(arrayOf(named("i32")))).toBe("i32[]");
    expect(asValType(arrayOf(generic("c1", [named("f64")])))).toBe("c<f64>[]");
    expect(wasmHeapTypeName(arrayOf(generic("c1", [named("f64")])))).toBe("c_f64");
    expect(asIdent("in")).toBe("inn");
  });

  it("control-system blocks match XML ports as AssemblyScript params and results", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();

    expect(blockSignature(cat.block("timer")!)).toEqual({
      id: "timer",
      name: "Timer",
      params: [{ name: "inn", type: "c<f64>" }],
      results: [],
    });
    expect(blockSignature(cat.block("quantizer")!)).toEqual({
      id: "quantizer",
      name: "Quantizer",
      params: [{ name: "inn", type: "c<f64>" }],
      results: [{ name: "out", type: "c<f64>" }],
    });
    expect(blockSignature(cat.block("sin")!)).toEqual({
      id: "sin",
      name: "Sin",
      params: [{ name: "inn", type: "c<f64>" }],
      results: [{ name: "out", type: "c<f64>" }],
    });
    expect(blockSignature(cat.block("cos")!)).toEqual({
      id: "cos",
      name: "Cos",
      params: [{ name: "inn", type: "c<f64>" }],
      results: [{ name: "out", type: "c<f64>" }],
    });
    expect(blockSignature(cat.block("oscilloscope")!)).toEqual({
      id: "oscilloscope",
      name: "Oscilloscope",
      params: [],
      results: [{ name: "out", type: "c<f64>[]" }],
    });
    expect(displayType(cat.block("timer")!.inputs[0].ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("quantizer")!.outputs[0].ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("sin")!.outputs[0].ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("cos")!.outputs[0].ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("oscilloscope")!.outputs[0].ty, true)).toBe("c<f64>[]");
  });

  it("fixture type blocks use arguments as inputs and results as outputs", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateFixtureModels(diagram);
    const cat = diagram.catalog();

    expect(blockSignature(cat.block("b_f64")!)).toEqual({
      id: "b_f64",
      name: "f64",
      params: [],
      results: [{ name: "value", type: "f64" }],
    });
    expect(blockSignature(cat.block("b_bool")!)).toEqual({
      id: "b_bool",
      name: "bool",
      params: [],
      results: [{ name: "value", type: "bool" }],
    });
    expect(blockSignature(cat.block("b_str")!)).toEqual({
      id: "b_str",
      name: "str",
      params: [],
      results: [{ name: "value", type: "string" }],
    });
    expect(blockSignature(cat.block("b_array_get")!)).toEqual({
      id: "b_array_get",
      name: "array.get",
      params: [
        { name: "array", type: "T[]" },
        { name: "index", type: "i32" },
      ],
      results: [{ name: "elem", type: "T" }],
    });
  });

  it("emits named params and results without a boxed ctx pointer", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateFixtureModels(diagram);
    const cat = diagram.catalog();
    expect(asSignature(blockSignature(cat.block("timer")!))).toBe("function timer(inn: c<f64>): void");
    expect(asSignature(blockSignature(cat.block("sin")!))).toBe("function sin(inn: c<f64>): c<f64>");
    expect(asSignature(blockSignature(cat.block("oscilloscope")!))).toBe(
      "function oscilloscope(): c<f64>[]",
    );
    expect(asSignature(blockSignature(cat.block("b_decision")!))).toBe(
      "function b_decision(inn: T): T, T",
    );
  });
});
