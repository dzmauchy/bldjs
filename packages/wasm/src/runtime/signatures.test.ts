import { describe, expect, it } from "vitest";
import { arrayOf, consumerType, displayType, named, funcType } from "@bld/xml/blocks/ast";
import { associateBuiltinModels, associateFixtureModels } from "@bld/xml/blocks/builtin";
import { Diagram } from "@bld/xml/blocks/diagram";
import { blockSignature, signatureWat, wasmHeapTypeName, wasmValType } from "./signatures";

describe("XML ↔ WASM signatures", () => {
  it("maps MoonBit primitives and function types", () => {
    expect(wasmValType(named("double"))).toBe("f64");
    expect(wasmValType(named("int"))).toBe("i32");
    expect(wasmValType(named("bool"))).toBe("i32");
    expect(wasmValType(named("string"))).toBe("externref");
    expect(wasmValType(consumerType(named("double")))).toBe("(ref $fn_double_unit)");
    expect(wasmValType(funcType([], named("double")))).toBe("(ref $fn_double)");
    expect(wasmValType(funcType([named("int")], named("string")))).toBe("(ref $fn_int_string)");
    expect(wasmValType(consumerType(named("int"), named("double")))).toBe("(ref $fn_int_double_unit)");
    expect(wasmValType(funcType([named("int"), named("int64")], named("bool")))).toBe(
      "(ref $fn_int_int64_bool)",
    );
    expect(wasmValType(arrayOf(named("int")))).toBe("(ref $array_int)");
    expect(wasmValType(arrayOf(consumerType(named("double"))))).toBe("(ref $array_fn_double_unit)");
    expect(wasmHeapTypeName(arrayOf(consumerType(named("double"))))).toBe("array_fn_double_unit");
  });

  it("control-system blocks match XML ports as WASM params and results", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();

    for (const [id, name] of [
      ["timer", "Timer"],
      ["random", "Random"],
      ["constant", "Constant"],
      ["gpio_in", "GPIO In"],
    ] as const) {
      expect(blockSignature(cat.block(id)!)).toEqual({
        id,
        name,
        params: [{ name: "in", type: "(ref $fn_double_unit)" }],
        results: [],
      });
      expect(displayType(cat.block(id)!.inputs[0].ty, true)).toBe("(double) -> unit");
      expect(cat.block(id)!.outputs).toEqual([]);
    }
    for (const [id, name] of [
      ["sin", "Sin"],
      ["cos", "Cos"],
      ["overshoot", "Overshoot"],
    ] as const) {
      expect(blockSignature(cat.block(id)!)).toEqual({
        id,
        name,
        params: [{ name: "in", type: "(ref $fn_double_unit)" }],
        results: [{ name: "out", type: "(ref $fn_double_unit)" }],
      });
      expect(displayType(cat.block(id)!.inputs[0].ty, true)).toBe("(double) -> unit");
      expect(displayType(cat.block(id)!.outputs[0].ty, true)).toBe("(double) -> unit");
    }
    expect(blockSignature(cat.block("product")!)).toEqual({
      id: "product",
      name: "Product",
      params: [{ name: "in", type: "(ref $fn_double_unit)" }],
      results: [{ name: "out", type: "(ref $array_fn_double_unit)" }],
    });
    expect(displayType(cat.block("product")!.outputs[0].ty, true)).toBe("array[(double) -> unit]");
    expect(cat.block("quantizer")).toBeUndefined();
    expect(blockSignature(cat.block("scope")!)).toEqual({
      id: "scope",
      name: "Scope",
      params: [],
      results: [{ name: "out", type: "(ref $array_fn_double_unit)" }],
    });
    expect(displayType(cat.block("scope")!.outputs[0].ty, true)).toBe("array[(double) -> unit]");
    expect(blockSignature(cat.block("gpio_out")!)).toEqual({
      id: "gpio_out",
      name: "GPIO Out",
      params: [],
      results: [{ name: "out", type: "(ref $fn_double_unit)" }],
    });
  });

  it("fixture type blocks use arguments as inputs and results as outputs", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateFixtureModels(diagram);
    const cat = diagram.catalog();

    expect(blockSignature(cat.block("b_Double")!)).toEqual({
      id: "b_Double",
      name: "Double",
      params: [],
      results: [{ name: "value", type: "f64" }],
    });
    expect(blockSignature(cat.block("b_Bool")!)).toEqual({
      id: "b_Bool",
      name: "Bool",
      params: [],
      results: [{ name: "value", type: "i32" }],
    });
    expect(blockSignature(cat.block("b_String")!)).toEqual({
      id: "b_String",
      name: "String",
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
      "(func $timer (param $ctx i32) (param $in (ref $fn_double_unit))",
    );
    expect(signatureWat(blockSignature(cat.block("sin")!))).toBe(
      "(func $sin (param $ctx i32) (param $in (ref $fn_double_unit)) (result $out (ref $fn_double_unit))",
    );
    expect(signatureWat(blockSignature(cat.block("scope")!))).toBe(
      "(func $scope (param $ctx i32) (result $out (ref $array_fn_double_unit))",
    );
    expect(signatureWat(blockSignature(cat.block("b_decision")!), false)).toBe(
      "(func $b_decision (param $in externref) (result $true externref) (result $false externref)",
    );
  });
});
