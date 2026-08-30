import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { blockSignature, signatureWat, wasmValType } from "./signatures";
import { arrayOf, displayType, named, generic } from "../blocks/ast";

describe("XML ↔ WASM signatures", () => {
  it("maps catalog primitives and function types", () => {
    expect(wasmValType(named("f64"))).toBe("f64");
    expect(wasmValType(named("i32"))).toBe("i32");
    expect(wasmValType(named("bool"))).toBe("i32");
    expect(wasmValType(named("str"))).toBe("externref");
    expect(wasmValType(generic("c1", [named("f64")]))).toBe("(ref $c1_f64)");
    expect(wasmValType(generic("s", [named("f64")]))).toBe("(ref $s_f64)");
    expect(wasmValType(generic("f1", [named("i32"), named("str")]))).toBe("(ref $f1_i32_str)");
    expect(wasmValType(generic("c2", [named("i32"), named("f64")]))).toBe("(ref $c2_i32_f64)");
    expect(wasmValType(generic("f2", [named("i32"), named("i64"), named("bool")]))).toBe(
      "(ref $f2_i32_i64_bool)",
    );
    expect(wasmValType(arrayOf(named("i32")))).toBe("(ref $array_i32)");
  });

  it("control-system blocks match WASM params and results", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();

    expect(blockSignature(cat.block("timer")!)).toEqual({
      id: "timer",
      name: "Timer",
      params: [{ name: "in", type: "f64" }],
      results: [],
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
    expect(blockSignature(cat.block("cos")!)).toEqual({
      id: "cos",
      name: "Cos",
      params: [{ name: "in", type: "f64" }],
      results: [{ name: "out", type: "f64" }],
    });
    expect(blockSignature(cat.block("oscilloscope")!)).toEqual({
      id: "oscilloscope",
      name: "Oscilloscope",
      params: [],
      results: [{ name: "out", type: "f64" }],
    });
    expect(displayType(cat.block("timer")!.inputs[0].ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("quantizer")!.outputs[0].ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("sin")!.outputs[0].ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("cos")!.outputs[0].ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("oscilloscope")!.outputs[0].ty, true)).toBe("c<f64>");
  });

  it("types.xml blocks use arguments as inputs and results as outputs", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
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
      results: [{ name: "value", type: "i32" }],
    });
    expect(blockSignature(cat.block("b_str")!)).toEqual({
      id: "b_str",
      name: "str",
      params: [],
      results: [{ name: "value", type: "externref" }],
    });
    expect(blockSignature(cat.block("b_array_get")!)).toEqual({
      id: "b_array_get",
      name: "array.get",
      params: [
        { name: "array", type: "(ref $array_T)" },
        { name: "index", type: "i32" },
      ],
      results: [{ name: "elem", type: "externref" }],
    });
  });

  it("emits named params, named results, and a runtime $ctx", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();
    expect(signatureWat(blockSignature(cat.block("timer")!))).toBe(
      "(func $timer (param $ctx i32) (param $in f64)",
    );
    expect(signatureWat(blockSignature(cat.block("sin")!))).toBe(
      "(func $sin (param $ctx i32) (param $in f64) (result $out f64)",
    );
    expect(signatureWat(blockSignature(cat.block("b_decision")!), false)).toBe(
      "(func $b_decision (param $in externref) (result $true externref) (result $false externref)",
    );
  });
});
