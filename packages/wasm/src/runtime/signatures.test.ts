import { describe, expect, it } from "vitest";
import { arrayOf, displayType, named, generic } from "@bld/xml/blocks/ast";
import { associateBuiltinModels, associateFixtureModels } from "@bld/xml/blocks/builtin";
import { Diagram } from "@bld/xml/blocks/diagram";
import { blockSignature, signatureWat, wasmHeapTypeName, wasmValType } from "./signatures";

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
    expect(wasmValType(arrayOf(generic("c1", [named("f64")])))).toBe("(ref $array_c1_f64)");
    expect(wasmHeapTypeName(arrayOf(generic("c1", [named("f64")])))).toBe("array_c1_f64");
  });

  it("control-system blocks match XML ports as WASM params and results", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();

    for (const [id, name] of [
      ["timer", "Timer"],
      ["sin", "Sin"],
      ["cos", "Cos"],
      ["random", "Random"],
    ] as const) {
      expect(blockSignature(cat.block(id)!)).toEqual({
        id,
        name,
        params: [{ name: "in", type: "(ref $c1_f64)" }],
        results: [],
      });
      expect(displayType(cat.block(id)!.inputs[0].ty, true)).toBe("c<f64>");
      expect(cat.block(id)!.outputs).toEqual([]);
    }
    expect(cat.block("quantizer")).toBeUndefined();
    expect(blockSignature(cat.block("scope")!)).toEqual({
      id: "scope",
      name: "Scope",
      params: [],
      results: [{ name: "out", type: "(ref $array_c1_f64)" }],
    });
    expect(displayType(cat.block("scope")!.outputs[0].ty, true)).toBe("c<f64>[]");
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
    associateFixtureModels(diagram);
    const cat = diagram.catalog();
    expect(signatureWat(blockSignature(cat.block("timer")!))).toBe(
      "(func $timer (param $ctx i32) (param $in (ref $c1_f64))",
    );
    expect(signatureWat(blockSignature(cat.block("sin")!))).toBe(
      "(func $sin (param $ctx i32) (param $in (ref $c1_f64))",
    );
    expect(signatureWat(blockSignature(cat.block("scope")!))).toBe(
      "(func $scope (param $ctx i32) (result $out (ref $array_c1_f64))",
    );
    expect(signatureWat(blockSignature(cat.block("b_decision")!), false)).toBe(
      "(func $b_decision (param $in externref) (result $true externref) (result $false externref)",
    );
  });
});
