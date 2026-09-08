import { describe, expect, it } from "vitest";
import {
  type TypeExpr,
  arrayOf,
  blockAttribute,
  blockInput,
  consumerType,
  displayType,
  funcType,
  isConsumerType,
  isPushType,
  SelfType,
  typeToString,
  generic,
  named,
  typesEqual,
  unbounded,
  unionOf,
  intersectionOf,
  WildcardType,
  wildcard,
  wildcardExtends,
  wildcardSuper,
  PRIMITIVE_TYPES,
  BUILTIN_CONTAINER_TYPES,
  SPECIAL_TYPES,
  TYPE_KINDS,
  PORT_DIRECTIONS,
  RELATION_KINDS,
  BLOCK_PARAMETER_KINDS,
  SETTING_KINDS,
  VARIANCE_TYPES,
  isPrimitiveType,
  isBuiltinContainerType,
  isSpecialType,
  isTypeKind,
  isPortDirection,
  isRelationKind,
  isBlockParameterKind,
  isSettingKind,
  isVarianceType,
} from "./ast";
import {
  CONTROL_SYSTEMS_JSON,
  FIXTURES_JSON,
  TYPES_JSON,
  associateBuiltinModels,
  associateFixtureModels,
  catalogSourcesForFiles,
} from "./builtin";
import { Catalog } from "./catalog";
import { isCompatible } from "./compat";
import {
  COMBINER_IDS,
  GENERATOR_IDS,
  planGenerator,
} from "./cs";
import { type Link, Diagram } from "./diagram";
import { parseCatalog } from "./parse";
import {
  type Grounding,
  TypeResolver,
  resolvedInput,
  resolvedOutput,
  inferCommonType,
  inferIntersection,
  inferUnion,
  simplifyIntersection,
  simplifyUnion,
} from "./resolve";
import { isPrimitive, PRIMITIVES } from "./types";


function t(name: string): TypeExpr {
  return named(name);
}

function g(name: string, args: TypeExpr[]): TypeExpr {
  return generic(name, args);
}

function catalog(): Catalog {
  const next = new Catalog();
  next.addJson("types.json", TYPES_JSON);
  next.addJson("fixtures.json", FIXTURES_JSON);
  next.addJson("control-systems.json", CONTROL_SYSTEMS_JSON);
  return next;
}

function resolveBlock(cat: Catalog, id: string, grounded: Map<string, Grounding>) {
  const block = cat.block(id);
  if (!block) {
    throw new Error(`missing block ${id}`);
  }
  return new TypeResolver(cat).resolve(block, grounded);
}

function expectType(actual: TypeExpr | undefined, expected: TypeExpr): void {
  expect(actual, `expected ${displayType(expected, true)}`).toBeDefined();
  expect(typesEqual(actual!, expected), `${displayType(actual!, true)} !== ${displayType(expected, true)}`).toBe(
    true,
  );
}

describe("blocks", () => {
  it("rejects unknown catalog fields", () => {
    expect(() => parseCatalog("t.json", { id: "t", name: "T", library: { id: "lib" } })).toThrow(
      /unsupported catalog field `library`/,
    );
  });

  it("parses a catalog with namespaces", () => {
    expect(parseCatalog("t.json", { id: "t", name: "T", namespaces: [{ id: "n", name: "N" }] }).id).toBe("t");
  });

  it("parses blocks.md apply example", () => {
    const doc = parseCatalog("apply.json", {
      id: "workspace_01",
      name: "Signal Processing",
      icon: "workspace.png",
      namespaces: [{ id: "types", name: "Types", icon: "box.png" }],
      blocks: [
        {
          id: "b_apply",
          name: "Apply",
          ns: "types",
          icon: "func.png",
          params: ["T", "R"],
          factory: "apply",
          in: [
            { name: "fn", type: { name: "f1", args: ["T", "R"] } },
            { name: "arg", type: "T" },
          ],
          out: [{ name: "result", type: "R" }],
        },
      ],
    });
    expect(doc.id).toBe("workspace_01");
    const block = doc.blocks[0];
    expect(block.params.length).toBe(2);
    expectType(block.inputs[0].ty, funcType([t("T")], t("R")));
    expectType(block.inputs[1].ty, t("T"));
    expectType(block.outputs[0].ty, t("R"));
  });

  it("parses MoonBit holes and arrays", () => {
    const doc = parseCatalog("wild.json", {
      id: "w",
      name: "Holes",
      blocks: [
        {
          id: "b",
          name: "W",
          ns: "test",
          in: [
            { name: "ints", type: { name: "Array", args: ["Int"] } },
            { name: "consumer", type: { name: "c1", args: ["Double"] } },
            { name: "unboundedInput", type: { name: "Array", args: ["_"] } },
          ],
        },
      ],
    });
    const block = doc.blocks[0];
    expectType(block.inputs[0].ty, arrayOf(t("Int")));
    expectType(block.inputs[1].ty, consumerType(t("Double")));
    expectType(block.inputs[2].ty, arrayOf(unbounded()));
  });

  it("parses union intersection and Self", () => {
    const doc = parseCatalog("u.json", {
      id: "u",
      name: "U",
      blocks: [
        {
          id: "b_path",
          name: "path",
          ns: "example.Builder",
          in: [
            { name: "segment", type: "String" },
            {
              name: "complexPayload",
              type: {
                intersection: [{ name: "c1", args: ["T"] }, { name: "f0", args: ["T"] }],
              },
            },
          ],
          out: [
            { name: "result", type: { union: ["Int", "Int64"] } },
            { name: "this", type: "Self" },
          ],
        },
      ],
    });
    const block = doc.blocks[0];
    expectType(block.outputs[0].ty, unionOf([t("Int"), t("Int64")]));
    expect(block.outputs[1].ty.kind).toBe("self");
    expect(block.inputs[1].ty.kind).toBe("intersection");
  });

  it("parses f-bounded Rec param", () => {
    const doc = parseCatalog("e.json", {
      id: "e",
      name: "E",
      blocks: [
        {
          id: "b_rec_new",
          name: "rec.new",
          ns: "example",
          params: [{ name: "T", extends: { name: "Rec", args: ["T"] } }],
          in: [{ name: "cls", type: { name: "c1", args: ["T"] } }],
          out: [{ name: "value", type: "T" }],
        },
      ],
    });
    expectType(doc.blocks[0].params[0].extends[0], g("Rec", [t("T")]));
  });

  it("builtin models merge", () => {
    const cat = new Catalog();
    cat.addJson("types.json", TYPES_JSON);
    cat.addJson("control-systems.json", CONTROL_SYSTEMS_JSON);
    expect(cat.block("timer")).toBeDefined();
    expect(cat.block("sin")).toBeDefined();
    expect(cat.block("cos")).toBeDefined();
    expect(cat.block("overshoot")).toBeDefined();
    expect(cat.block("product")).toBeDefined();
    expect(cat.block("constant")).toBeDefined();
    expect(cat.block("random")).toBeDefined();
    expect(cat.block("scope")).toBeDefined();
    expect(cat.block("gpio_in")).toBeDefined();
    expect(cat.block("gpio_out")).toBeDefined();
    expect(cat.block("quantizer")).toBeUndefined();
    expect(cat.block("b_array_of")).toBeUndefined();
    expect(cat.block("b_start")).toBeUndefined();
    expect(cat.blocks().map((block) => block.id).sort()).toEqual([
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
    expect(cat.findType("bool")).toBeDefined();
    expect(cat.findType("u64")).toBeDefined();
    expect(cat.findType("u32")).toBeDefined();
    expect(cat.findType("i64")).toBeDefined();
    expect(cat.findType("i32")).toBeDefined();
    expect(cat.findType("f32")).toBeDefined();
    expect(cat.findType("f64")).toBeDefined();
    expect(cat.findType("char")).toBeDefined();
    expect(cat.findType("void")).toBeDefined();
    expect(cat.findType("c1")).toBeDefined();
    expect(cat.sources().length).toBe(2);
    expect(cat.catalogs().map((item) => [item.file, item.name])).toEqual([
      ["types.json", "Types"],
      ["control-systems.json", "Control Systems"],
    ]);
  });

  it("looks up builtin catalogs by file name", () => {
    expect(catalogSourcesForFiles(["types.json"]).map((source) => source.name)).toEqual(["types.json"]);
    expect(() => catalogSourcesForFiles(["missing.json"])).toThrow("unknown catalog");
    expect(() => catalogSourcesForFiles(["models/types.json"])).toThrow("unknown catalog");
  });

  it("Array[Double] is compatible with Array[_]", () => {
    const cat = catalog();
    const formal = arrayOf(unbounded());
    const actual = arrayOf(t("Double"));
    expect(isCompatible(cat, [], formal, actual)).toBe(true);
    const invariant = arrayOf(t("Int"));
    expect(isCompatible(cat, [], invariant, actual)).toBe(false);
  });

  it("consumers and functions are distinct MoonBit types", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], consumerType(t("Double")), consumerType(t("Double")))).toBe(true);
    expect(isCompatible(cat, [], consumerType(t("Double")), funcType([t("Double")], t("Double")))).toBe(false);
    expect(isCompatible(cat, [], funcType([], t("Double")), consumerType(t("Double")))).toBe(false);
  });

  it("function types are contravariant in arguments", () => {
    const cat = catalog();
    const formal = consumerType(consumerType(t("Double")));
    expect(isCompatible(cat, [], formal, consumerType(funcType([], t("Double"))))).toBe(false);
    expect(isCompatible(cat, [], formal, consumerType(t("Int")))).toBe(false);
    expect(isCompatible(cat, [], formal, consumerType(consumerType(t("Double"))))).toBe(true);
  });

  it("parses Array[T] notation", () => {
    const doc = parseCatalog("arr.json", {
      id: "a",
      name: "A",
      blocks: [
        {
          id: "b",
          name: "B",
          ns: "test",
          in: [
            { name: "sugar", type: { name: "Array", args: ["Double"] } },
            { name: "nested", type: { name: "Array", args: [{ name: "Array", args: ["Int"] }] } },
          ],
          out: [{ name: "alias", type: { name: "Array", args: ["String"] } }],
        },
      ],
    });
    expectType(doc.blocks[0].inputs[0].ty, arrayOf(t("Double")));
    expectType(doc.blocks[0].inputs[1].ty, arrayOf(arrayOf(t("Int"))));
    expectType(doc.blocks[0].outputs[0].ty, arrayOf(t("String")));
  });

  it("catalog primitives do not widen and Bool is not Int", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], t("Int64"), t("Int"))).toBe(false);
    expect(isCompatible(cat, [], t("Int"), t("Int64"))).toBe(false);
    expect(isCompatible(cat, [], t("Double"), t("Float"))).toBe(false);
    expect(isCompatible(cat, [], t("Double"), t("Double"))).toBe(true);
    expect(isCompatible(cat, [], t("Bool"), t("Int"))).toBe(false);
    expect(isCompatible(cat, [], t("Int"), t("Bool"))).toBe(false);
    expect(isCompatible(cat, [], t("String"), t("Int"))).toBe(false);
  });

  it("infer array of from Double grounding", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_array_of",
      new Map([["elems", { kind: "single", ty: t("Double") }]]),
    );
    expectType(resolved.params.get("T"), t("Double"));
    expectType(resolvedOutput(resolved, "result"), arrayOf(t("Double")));
    expect(resolved.compatible.get("elems")).toBe(true);
  });

  it("infer array of vararg union", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_array_of",
      new Map([["elems", { kind: "varargs", items: [t("Double"), t("Int")] }]]),
    );
    expectType(resolvedOutput(resolved, "result"), arrayOf(unionOf([t("Double"), t("Int")])));
  });

  it("infer (T1, T2) -> R from two inputs", () => {
    const cat = catalog();
    cat.addJson("f2.json", {
      id: "fn",
      name: "Fn",
      blocks: [
        {
          id: "b_apply_f2",
          name: "apply2",
          ns: "test",
          params: ["T1", "T2", "R"],
          in: [
            { name: "fn", type: { name: "f2", args: ["T1", "T2", "R"] } },
            { name: "a", type: "T1" },
            { name: "b", type: "T2" },
          ],
          out: [{ name: "result", type: "R" }],
        },
      ],
    });
    const resolved = resolveBlock(
      cat,
      "b_apply_f2",
      new Map([
        ["fn", { kind: "single", ty: funcType([t("Int"), t("String")], t("Bool")) }],
        ["a", { kind: "single", ty: t("Int") }],
        ["b", { kind: "single", ty: t("String") }],
      ]),
    );
    expectType(resolved.params.get("T1"), t("Int"));
    expectType(resolved.params.get("T2"), t("String"));
    expectType(resolved.params.get("R"), t("Bool"));
    expectType(resolvedOutput(resolved, "result"), t("Bool"));
  });

  it("unbound param grounds to a hole", () => {
    const resolved = resolveBlock(catalog(), "b_process", new Map());
    expectType(resolvedOutput(resolved, "out"), unbounded());
  });

  it("process identity from array", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_process",
      new Map([["in", { kind: "single", ty: arrayOf(t("Double")) }]]),
    );
    expectType(resolvedOutput(resolved, "out"), arrayOf(t("Double")));
  });

  it("array get infers element type", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_array_get",
      new Map([
        ["array", { kind: "single", ty: arrayOf(t("Double")) }],
        ["index", { kind: "single", ty: t("Int") }],
      ]),
    );
    expectType(resolvedOutput(resolved, "elem"), t("Double"));
  });

  it("f-bounded Rec resolves through a multi-file catalog", () => {
    const cat = catalog();
    cat.addJson("color.json", {
      id: "example",
      name: "Example",
      types: [
        { name: "Rec", ns: "example", params: [{ name: "E", extends: { name: "Rec", args: ["E"] } }] },
        { name: "Color", ns: "example", ancestors: [{ name: "Rec", args: ["Color"] }] },
      ],
      blocks: [
        { id: "b_color_fn", name: "Color.fn", ns: "example", out: [{ name: "value", type: { name: "c1", args: ["Color"] } }] },
        {
          id: "b_rec_new",
          name: "rec.new",
          ns: "example",
          params: [{ name: "T", extends: { name: "Rec", args: ["T"] } }],
          in: [{ name: "cls", type: { name: "c1", args: ["T"] } }],
          out: [{ name: "value", type: "T" }],
        },
      ],
    });
    const resolved = resolveBlock(
      cat,
      "b_rec_new",
      new Map([["cls", { kind: "single", ty: consumerType(t("Color")) }]]),
    );
    expectType(resolvedOutput(resolved, "value"), t("Color"));
    expect(resolved.compatible.get("cls")).toBe(true);
  });

  it("incompatible grounding is reported", () => {
    const cat = catalog();
    cat.addJson("need.json", {
      id: "b",
      name: "B",
      blocks: [
        {
          id: "need_c1",
          name: "Need",
          ns: "test",
          params: [{ name: "N", extends: { name: "c1", args: ["Double"] } }],
          in: [{ name: "in", type: "N" }],
          out: [{ name: "out", type: "N" }],
        },
      ],
    });
    const resolved = resolveBlock(cat, "need_c1", new Map([["in", { kind: "single", ty: t("Int") }]]));
    expect(resolved.compatible.get("in")).toBe(false);
  });

  it("builder Self type is namespace", () => {
    const cat = new Catalog();
    cat.addJson("mod.json", {
      id: "mod",
      name: "Module",
      blocks: [
        {
          id: "b_path",
          name: "path",
          ns: "example.Builder",
          factory: "Builder#path",
          in: [{ name: "segment", type: "String" }],
          out: [{ name: "this", type: "Self" }],
        },
      ],
    });
    const resolved = resolveBlock(cat, "b_path", new Map([["segment", { kind: "single", ty: t("String") }]]));
    expectType(resolvedOutput(resolved, "this"), t("example.Builder"));
  });

  it("diagram associates multiple catalog files and grounds inputs", () => {
    const diagram = new Diagram("d1", "Demo");
    associateFixtureModels(diagram);
    expect(diagram.sources().length).toBe(3);

    const doubleId = diagram.addNode("b_Double");
    const intId = diagram.addNode("b_Int");
    const arrayId = diagram.addNode("b_array_of");
    const getId = diagram.addNode("b_array_get");
    const processId = diagram.addNode("b_process");

    diagram.addLink(doubleId, "value", arrayId, "elems");
    diagram.addLink(arrayId, "result", getId, "array");
    diagram.addLink(intId, "value", getId, "index");
    diagram.addLink(arrayId, "result", processId, "in");

    expectType(resolvedOutput(diagram.resolveNode(arrayId)!, "result"), arrayOf(t("Double")));
    expectType(resolvedOutput(diagram.resolveNode(getId)!, "elem"), t("Double"));
    expectType(resolvedOutput(diagram.resolveNode(processId)!, "out"), arrayOf(t("Double")));
  });

  it("diagram chain grounds through identity", () => {
    const diagram = new Diagram("d2", "Chain");
    associateFixtureModels(diagram);
    const doubleId = diagram.addNode("b_Double");
    const identId = diagram.addNode("b_identity");
    const arrayId = diagram.addNode("b_array_of");
    diagram.addLink(doubleId, "value", identId, "in");
    diagram.addLink(identId, "out", arrayId, "elems");
    expectType(resolvedOutput(diagram.resolveNode(arrayId)!, "result"), arrayOf(t("Double")));
  });

  it("dissociate catalog rebuilds catalog", () => {
    const diagram = new Diagram("d3", "Drop");
    associateFixtureModels(diagram);
    diagram.addNode("b_array_of");
    diagram.dissociateJson("fixtures.json");
    expect(diagram.catalog().block("b_array_of")).toBeUndefined();
    expect(diagram.catalog().block("timer")).toBeDefined();
    expect(diagram.nodes().length).toBe(0);
    expect(diagram.catalog().catalogs().map((item) => item.name)).toEqual(["Types", "Control Systems"]);
  });

  it("hole display", () => {
    expect(displayType(unbounded(), true)).toBe("_");
    expect(unbounded().kind).toBe("hole");
  });

  it("substitutes params, replaces Self, and flattens unions", () => {
    const substituted = consumerType(t("T")).subst(new Map([["T", t("Double")]]));
    expect(displayType(substituted, true)).toBe("(Double) -> void");
    expect(displayType(new SelfType().replaceSelf(t("Int")), true)).toBe("Int");
    expect(typesEqual(unionOf([t("Int"), t("Int")]), t("Int"))).toBe(true);
    expect(consumerType(t("Double")).isConsumer()).toBe(true);
    expect(arrayOf(consumerType(t("Double"))).isPush()).toBe(true);
  });

  it("displays common MoonBit types", () => {
    expect(displayType(consumerType(t("Double")), true)).toBe("(Double) -> void");
    expect(displayType(consumerType(consumerType(t("Double"))), true)).toBe("((Double) -> void) -> void");
    expect(displayType(consumerType(consumerType(consumerType(t("Double")))), true)).toBe(
      "(((Double) -> void) -> void) -> void",
    );
    expect(typeToString(consumerType(consumerType(consumerType(t("Double")))))).toBe(
      "(((Double) -> void) -> void) -> void",
    );
    expect(displayType(funcType([t("Int")], t("String")), true)).toBe("(Int) -> String");
    expect(displayType(funcType([t("Int"), t("Int64")], t("Bool")), true)).toBe("(Int, Int64) -> Bool");
    expect(displayType(funcType([], t("Double")), true)).toBe("() -> Double");
    expect(displayType(consumerType(t("String"), t("Bool")), true)).toBe("(String, Bool) -> void");
    expect(displayType(t("Double"), true)).toBe("Double");
    expect(displayType(arrayOf(t("Double")), true)).toBe("Array[Double]");
    expect(displayType(arrayOf(arrayOf(t("Int"))), true)).toBe("Array[Array[Int]]");
    expect(displayType(unionOf([t("Int"), t("Int64")]), true)).toBe("Int | Int64");
    expect(displayType(arrayOf(unionOf([t("Int"), t("Int64")])), true)).toBe("Array[(Int | Int64)]");
  });

  it("control systems model and types", () => {
    const cat = catalog();
    const timerBlock = cat.block("timer")!;
    expect(timerBlock.inputs.length).toBe(1);
    expect(timerBlock.outputs.length).toBe(0);
    expect(displayType(timerBlock.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(timerBlock.inputs.find((port) => port.name === "in")!.attributes.find((a) => a.name === "wasm")).toBeUndefined();
    expect(timerBlock.attributes.find((a) => a.name === "runnable")?.value).toBe("true");
    expect(timerBlock.attributes.find((a) => a.name === "generator")?.value).toBe("true");
    expect(cat.block("sin")!.attributes.find((a) => a.name === "generator")).toBeUndefined();
    expect(cat.block("cos")!.attributes.find((a) => a.name === "generator")).toBeUndefined();
    expect(cat.block("overshoot")!.attributes.find((a) => a.name === "generator")).toBeUndefined();
    expect(cat.block("product")!.attributes.find((a) => a.name === "generator")).toBeUndefined();
    expect(cat.block("product")!.attributes.find((a) => a.name === "combiner")?.value).toBe("true");
    expect(
      new Set(
        cat
          .blocks()
          .filter((block) => blockAttribute(block, "generator") === "true")
          .map((block) => block.id),
      ),
    ).toEqual(GENERATOR_IDS);
    expect(
      new Set(
        cat
          .blocks()
          .filter((block) => blockAttribute(block, "combiner") === "true")
          .map((block) => block.id),
      ),
    ).toEqual(COMBINER_IDS);
    const scope = cat.block("scope")!;
    expect(scope.inputs.length).toBe(0);
    expect(displayType(scope.outputs.find((port) => port.name === "out")!.ty, true)).toBe("Array[(f32) -> void]");
    expect(scope.outputs.find((port) => port.name === "out")!.attributes.find((a) => a.name === "dynamic")?.value).toBe(
      "true",
    );
    expect(displayType(cat.block("sin")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(cat.block("sin")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(cat.block("cos")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(cat.block("cos")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(cat.block("overshoot")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(cat.block("overshoot")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(cat.block("random")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(cat.block("constant")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(cat.block("constant")!.outputs).toEqual([]);
    const productBlock = cat.block("product")!;
    expect(displayType(productBlock.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(productBlock.outputs.find((port) => port.name === "out")!.ty, true)).toBe("Array[(f32) -> void]");
    expect(productBlock.outputs.find((port) => port.name === "out")!.attributes.find((a) => a.name === "dynamic")?.value).toBe(
      "true",
    );
    expect(timerBlock.ns).toBe("com.dauch.cs.gen");
    expect(cat.block("sin")!.ns).toBe("com.dauch.cs.tf");
    expect(cat.block("cos")!.ns).toBe("com.dauch.cs.tf");
    expect(cat.block("overshoot")!.ns).toBe("com.dauch.cs.tf");
    expect(cat.block("product")!.ns).toBe("com.dauch.cs.tf");
    expect(cat.block("random")!.ns).toBe("com.dauch.cs.gen");
    expect(cat.block("constant")!.ns).toBe("com.dauch.cs.gen");
    expect(scope.ns).toBe("com.dauch.cs.sink");
    expect(cat.block("gpio_in")!.ns).toBe("com.dauch.cs.gpio");
    expect(cat.block("gpio_out")!.ns).toBe("com.dauch.cs.gpio");
    expect(cat.namespaceLabel("com.dauch.cs")).toBe("Control Systems");
    expect(cat.namespaceLabel("com.dauch.cs.gen")).toBe("Gen");
    expect(cat.namespaceLabel("com.dauch.cs.tf")).toBe("Transform");
    expect(cat.namespaceLabel("com.dauch.cs.sink")).toBe("Sink");
    expect(cat.namespaces.get("com.dauch.cs.gen")?.parent).toBe("com.dauch.cs");
    expect(cat.namespaces.get("com.dauch.cs.tf")?.parent).toBe("com.dauch.cs");
    expect(cat.namespaces.get("com.dauch.cs.sink")?.parent).toBe("com.dauch.cs");
    expect(cat.namespaces.get("com.dauch.cs.gpio")?.parent).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs.gen")).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs.tf")).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs.sink")).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs.gpio")).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs")).toBeNull();
    for (const id of ["timer", "random", "constant"] as const) {
      const period = cat.block(id)!.parameters.find((param) => param.name === "period");
      expect(period?.kind).toBe("integer-range-parameter");
      expect(period?.default).toBe("10");
      expect(period?.min).toBe(1);
      expect(period?.max).toBe(1000);
    }
    const value = cat.block("constant")!.parameters.find((param) => param.name === "value");
    expect(value?.kind).toBe("double-range-parameter");
    expect(value?.default).toBe("1");
    expect(value?.min).toBe(-100);
    expect(value?.max).toBe(100);
    expect(value?.step).toBe(0.1);
    expect(cat.block("sin")!.parameters).toEqual([]);
    expect(cat.block("cos")!.parameters).toEqual([]);
    const zeta = cat.block("overshoot")!.parameters.find((param) => param.name === "ζ");
    expect(zeta?.kind).toBe("double-range-parameter");
    expect(zeta?.default).toBe("0.5");
    expect(zeta?.min).toBe(0.05);
    expect(zeta?.max).toBe(0.95);
    expect(zeta?.step).toBe(0.01);
    const omega = cat.block("overshoot")!.parameters.find((param) => param.name === "ω");
    expect(omega?.kind).toBe("double-range-parameter");
    expect(omega?.default).toBe("1");
    expect(omega?.min).toBe(0.1);
    expect(omega?.max).toBe(20);
    expect(omega?.step).toBe(0.1);
    const productN = cat.block("product")!.parameters.find((param) => param.name === "n");
    const productDef = cat.block("product")!.parameters.find((param) => param.name === "def");
    expect(productN?.kind).toBe("integer-range-parameter");
    expect(productN?.description).toBe("Output count");
    expect(productN?.default).toBe("2");
    expect(productN?.min).toBe(1);
    expect(productN?.max).toBe(8);
    expect(productDef?.kind).toBe("double-range-parameter");
    expect(productDef?.description).toBe("Default value of each output");
    expect(productDef?.default).toBe("1");
    expect(productDef?.min).toBe(-100);
    expect(productDef?.max).toBe(100);
    const n = cat.block("scope")!.parameters.find((param) => param.name === "n");
    const m = cat.block("scope")!.parameters.find((param) => param.name === "m");
    expect(n?.kind).toBe("integer-range-parameter");
    expect(n?.description).toBe("Time window width in seconds");
    expect(n?.default).toBe("30");
    expect(n?.min).toBe(10);
    expect(n?.max).toBe(600);
    expect(m?.kind).toBe("integer-range-parameter");
    expect(m?.description).toBe("Quantizer period in milliseconds");
    expect(m?.default).toBe("10");
    expect(m?.min).toBe(10);
    expect(m?.max).toBe(1000);
    const gpioIn = cat.block("gpio_in")!;
    expect(gpioIn.attributes.find((item) => item.name === "generator")?.value).toBe("true");
    expect(displayType(gpioIn.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(gpioIn.parameters.find((param) => param.name === "pin")?.default).toBe("0");
    expect(gpioIn.parameters.find((param) => param.name === "period")).toBeUndefined();
    const gpioOut = cat.block("gpio_out")!;
    expect(gpioOut.inputs.length).toBe(0);
    expect(displayType(gpioOut.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(f32) -> void");
    expect(gpioOut.parameters.find((param) => param.name === "pin")?.default).toBe("1");
    expect(cat.findType("bool")).toBeDefined();
    expect(cat.findType("f32")).toBeDefined();
    expect(cat.findType("void")).toBeDefined();
    expect(cat.findType("i32")).toBeDefined();
  });

  it("nested consumers are not Double sample ports", () => {
    const cat = catalog();
    const nested = consumerType(consumerType(consumerType(t("Double"))));
    const mid = consumerType(consumerType(t("Double")));
    const leaf = consumerType(t("Double"));
    expect(isCompatible(cat, [], nested, t("Double"))).toBe(false);
    expect(isCompatible(cat, [], mid, t("Double"))).toBe(false);
    expect(isCompatible(cat, [], leaf, t("Double"))).toBe(false);
    expect(isCompatible(cat, [], mid, nested)).toBe(false);
    expect(isCompatible(cat, [], leaf, mid)).toBe(false);
    expect(isCompatible(cat, [], nested, nested)).toBe(true);
    expect(isCompatible(cat, [], mid, mid)).toBe(true);
    expect(isCompatible(cat, [], leaf, leaf)).toBe(true);
  });

  it("(Double) -> Unit is a consumer type that can be forked into one input", () => {
    expect(isConsumerType(consumerType(t("Double")))).toBe(true);
    expect(isConsumerType(t("Double"))).toBe(false);
    expect(isConsumerType(funcType([t("Double")], t("Double")))).toBe(false);
  });

  it("detects push-model wires from consumers and consumer vectors", () => {
    expect(isPushType(consumerType(t("Double")))).toBe(true);
    expect(isPushType(arrayOf(consumerType(t("Double"))))).toBe(true);
    expect(isPushType(arrayOf(arrayOf(consumerType(t("Double")))))).toBe(true);
    expect(isPushType(t("Double"))).toBe(false);
    expect(isPushType(funcType([], t("Double")))).toBe(false);
    expect(isPushType(funcType([t("Double")], t("Double")))).toBe(false);
    expect(isPushType(arrayOf(t("Double")))).toBe(false);
    expect(isPushType(undefined)).toBe(false);
  });

  it("plans a hidden fork when two scopes share a timer input", () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "scope" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    const plan = planGenerator(4, nodes, links)!;
    expect(plan.tree).toEqual({
      kind: "fork",
      inner: [
        { kind: "scope", id: 1 },
        { kind: "scope", id: 2 },
      ],
    });
    expect(plan.scopeIds).toEqual([1, 2]);
    expect(plan.channels).toEqual([
      { scopeId: 1, label: "timer" },
      { scopeId: 2, label: "timer" },
    ]);
  });

  it("plans two vector channels through sin and cos transformers", () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "cos" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    expect(planGenerator(4, nodes, links)?.channels).toEqual([
      { scopeId: 1, label: "sin" },
      { scopeId: 1, label: "cos" },
    ]);
    expect(planGenerator(2, nodes, links)).toBeUndefined();
  });

  it("plans slotted extra ports as the same multiplot", () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "cos" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    expect(planGenerator(4, nodes, links)?.channels).toEqual([
      { scopeId: 1, label: "sin" },
      { scopeId: 1, label: "cos" },
    ]);
  });

  it("plans generator product of two factors from a fork", () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "product", count: 2, def: 1 },
      { id: 3, defId: "sin" },
      { id: 4, defId: "cos" },
      { id: 5, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out[1]", toBlock: 4, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 5, toIn: "in" },
      { fromBlock: 4, fromOut: "out", toBlock: 5, toIn: "in" },
    ];
    expect(planGenerator(5, nodes, links)?.channels).toEqual([{ scopeId: 1, label: "product" }]);
  });

  it("plan generator walks a cos transformer", () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "cos" },
      { id: 3, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ];
    expect(planGenerator(3, nodes, links)?.tree).toEqual({
      kind: "map",
      defId: "cos",
      id: 2,
      inner: { kind: "scope", id: 1 },
    });
  });

  it("plan generator needs scope", () => {
    const nodes = [{ id: 4, defId: "timer" }];
    expect(planGenerator(4, nodes, [])).toBeUndefined();
  });

  it("plans GPIO output into a GPIO input generator", () => {
    const nodes = [
      { id: 1, defId: "gpio_out", pin: 1 },
      { id: 2, defId: "gpio_in", pin: 0 },
    ];
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const plan = planGenerator(2, nodes, links)!;
    expect(plan.defId).toBe("gpio_in");
    expect(plan.delayMs).toBe(0);
    expect(plan.tree).toEqual({ kind: "scope", id: 1 });
    expect(plan.scopeIds).toEqual([1]);
  });

  it("control systems diagram grounds nested func chain", () => {
    const diagram = new Diagram("cs", "Control Systems");
    associateBuiltinModels(diagram);
    const sinId = diagram.addNode("sin");
    const scopeId = diagram.addNode("scope");
    const timerId = diagram.addNode("timer");
    diagram.addLink(scopeId, "out", sinId, "in");
    diagram.addLink(sinId, "out", timerId, "in");

    const sinResolved = diagram.resolveNode(sinId)!;
    expect(sinResolved.compatible.get("in") ?? true).toBe(true);
    expect(displayType(sinResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(f32) -> void");
    expect(displayType(sinResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(f32) -> void");

    const scopeResolved = diagram.resolveNode(scopeId)!;
    expect(displayType(scopeResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("Array[(f32) -> void]");
    expect(diagram.resolveNode(timerId)!.compatible.get("in") ?? true).toBe(true);
  });

  it("a consumer vector may ground a (Double) -> Unit input", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], consumerType(t("Double")), arrayOf(consumerType(t("Double"))))).toBe(true);
    expect(isCompatible(cat, [], consumerType(t("Double")), arrayOf(t("Double")))).toBe(false);
  });

  it("two scopes may ground the same (Double) -> Unit input", () => {
    const diagram = new Diagram("cs", "Fork");
    associateBuiltinModels(diagram);
    const scopeA = diagram.addNode("scope");
    const scopeB = diagram.addNode("scope");
    const sinId = diagram.addNode("sin");
    diagram.addLink(scopeA, "out", sinId, "in");
    diagram.addLink(scopeB, "out", sinId, "in");
    expect(diagram.links()).toHaveLength(2);
    expect(diagram.resolveNode(sinId)!.compatible.get("in") ?? true).toBe(true);
  });

  it("extra slotted ports ground as the catalog consumer ports", () => {
    const diagram = new Diagram("cs", "Slots");
    associateBuiltinModels(diagram);
    const scopeId = diagram.addNode("scope");
    const sinId = diagram.addNode("sin");
    const cosId = diagram.addNode("cos");
    diagram.addLink(scopeId, "out", sinId, "in");
    diagram.addLink(scopeId, "out[1]", cosId, "in");
    const scope = diagram.resolveNode(scopeId)!;
    expect(displayType(resolvedOutput(scope, "out")!, true)).toBe("(f32) -> void");
    expect(displayType(resolvedOutput(scope, "out[1]")!, true)).toBe("(f32) -> void");
    expect(isPushType(resolvedOutput(scope, "out"))).toBe(true);
    expect(isPushType(resolvedOutput(scope, "out[1]"))).toBe(true);
    expect(diagram.resolveNode(sinId)!.compatible.get("in") ?? true).toBe(true);
    expect(diagram.resolveNode(cosId)!.compatible.get("in") ?? true).toBe(true);
    expect(displayType(resolvedInput(diagram.resolveNode(sinId)!, "in")!, true)).toBe("(f32) -> void");
    expect(displayType(resolvedOutput(diagram.resolveNode(sinId)!, "out")!, true)).toBe("(f32) -> void");
    expect(displayType(resolvedInput(diagram.resolveNode(cosId)!, "in")!, true)).toBe("(f32) -> void");
    expect(displayType(resolvedOutput(diagram.resolveNode(cosId)!, "out")!, true)).toBe("(f32) -> void");
  });

  it("scope vector wires to sin because Array[(Double) -> Unit] grounds (Double) -> Unit", () => {
    const diagram = new Diagram("cs", "Same");
    associateBuiltinModels(diagram);
    const scopeId = diagram.addNode("scope");
    const sinId = diagram.addNode("sin");
    diagram.addLink(scopeId, "out", sinId, "in");
    expect(diagram.resolveNode(sinId)!.compatible.get("in") ?? true).toBe(true);
  });

  it("array is incompatible with a (Double) -> Unit port", () => {
    const diagram = new Diagram("cs", "Skip");
    associateFixtureModels(diagram);
    const tableId = diagram.addNode("b_array_of");
    const sinId = diagram.addNode("sin");
    diagram.addLink(tableId, "result", sinId, "in");

    const sinResolved = diagram.resolveNode(sinId)!;
    expect(sinResolved.compatible.get("in")).toBe(false);
  });
});

describe("constants, settings, relations, and type intersection inference", () => {
  describe("constants and type guards", () => {
    it("defines and validates all primitive types", () => {
      expect(PRIMITIVE_TYPES).toEqual([
        "bool",
        "u64",
        "u32",
        "i64",
        "i32",
        "f32",
        "f64",
        "char",
        "void",
      ]);
      for (const prim of PRIMITIVE_TYPES) {
        expect(isPrimitiveType(prim)).toBe(true);
        expect(isPrimitive(prim)).toBe(true);
        expect(PRIMITIVES.has(prim)).toBe(true);
      }
      expect(isPrimitiveType("Unknown")).toBe(false);
      expect(isPrimitiveType("Array")).toBe(false);
      expect(isPrimitive("com.dauch.cs.f64")).toBe(true);
      expect(isPrimitive("com.dauch.cs.Unknown")).toBe(false);
    });

    it("defines and validates container, special, and type kinds", () => {
      expect(BUILTIN_CONTAINER_TYPES).toEqual(["Array"]);
      expect(isBuiltinContainerType("Array")).toBe(true);
      expect(isBuiltinContainerType("Int")).toBe(false);

      expect(SPECIAL_TYPES).toEqual(["Self", "_"]);
      expect(isSpecialType("Self")).toBe(true);
      expect(isSpecialType("_")).toBe(true);
      expect(isSpecialType("Double")).toBe(false);

      expect(TYPE_KINDS).toEqual([
        "type",
        "func",
        "tuple",
        "array",
        "union",
        "intersection",
        "hole",
        "self",
        "wildcard",
      ]);
      for (const kind of TYPE_KINDS) {
        expect(isTypeKind(kind)).toBe(true);
      }
      expect(isTypeKind("custom")).toBe(false);
    });

    it("defines and validates port directions and relation kinds", () => {
      expect(PORT_DIRECTIONS).toEqual(["in", "out"]);
      expect(isPortDirection("in")).toBe(true);
      expect(isPortDirection("out")).toBe(true);
      expect(isPortDirection("bidirectional")).toBe(false);

      expect(RELATION_KINDS).toEqual([
        "intersection",
        "union",
        "identity",
        "map",
        "subtype",
        "supertype",
        "custom",
      ]);
      for (const rel of RELATION_KINDS) {
        expect(isRelationKind(rel)).toBe(true);
      }
      expect(isRelationKind("unknown")).toBe(false);

      expect(VARIANCE_TYPES).toEqual(["+", "-"]);
      for (const v of VARIANCE_TYPES) {
        expect(isVarianceType(v)).toBe(true);
      }
      expect(isVarianceType("*")).toBe(false);
    });

    it("defines and validates parameter and setting kinds", () => {
      expect(BLOCK_PARAMETER_KINDS).toEqual([
        "integer-parameter",
        "count-parameter",
        "decimal-parameter",
        "duration-parameter",
        "date-parameter",
        "time-parameter",
        "date-time-parameter",
        "integer-range-parameter",
        "double-range-parameter",
        "text-parameter",
        "setting",
        "parameter",
      ]);
      expect(SETTING_KINDS).toEqual(BLOCK_PARAMETER_KINDS);
      for (const kind of BLOCK_PARAMETER_KINDS) {
        expect(isBlockParameterKind(kind)).toBe(true);
        expect(isSettingKind(kind)).toBe(true);
      }
      expect(isBlockParameterKind("color-parameter")).toBe(false);
    });
  });

  describe("JSON settings and parameter representation", () => {
    it("parses block settings and typed setting elements", () => {
      const doc = parseCatalog("cfg.json", {
        id: "cfg",
        name: "Config",
        blocks: [
          {
            id: "b_cfg",
            name: "ConfigBlock",
            ns: "test",
            settings: [
              { name: "bufferSize", type: "Int", default: "1024", min: 64, max: 65536, step: 64 },
              { name: "threshold", type: "Double", default: "0.75", min: 0, max: 1, step: 0.05 },
              { name: "mode", type: "String", default: "fast", pattern: "[a-z]+" },
            ],
          },
        ],
      });
      const block = doc.blocks[0];
      expect(block.parameters).toHaveLength(3);
      expect(block.settings).toHaveLength(3);

      const buf = block.parameters[0];
      expect(buf.name).toBe("bufferSize");
      expect(buf.kind).toBe("setting");
      expectType(buf.type as TypeExpr, t("Int"));
      expect(buf.default).toBe("1024");
      expect(buf.min).toBe(64);
      expect(buf.max).toBe(65536);
      expect(buf.step).toBe(64);

      const thresh = block.parameters[1];
      expect(thresh.name).toBe("threshold");
      expectType(thresh.type as TypeExpr, t("Double"));
      expect(thresh.default).toBe("0.75");

      const mode = block.parameters[2];
      expect(mode.name).toBe("mode");
      expectType(mode.type as TypeExpr, t("String"));
      expect(mode.pattern).toBe("[a-z]+");
    });

    it("parses block with typed specific parameters", () => {
      const doc = parseCatalog("p.json", {
        id: "p",
        name: "Params",
        blocks: [
          {
            id: "b_proc",
            name: "Proc",
            ns: "test",
            parameters: [
              { kind: "integer-parameter", name: "retries", type: "Int", default: "3" },
              { kind: "double-range-parameter", name: "ratio", type: "Double", min: 0.1, max: 5.0, step: 0.1, default: "1.0" },
              { kind: "parameter", name: "customFlag", type: "Bool", default: "true" },
            ],
          },
        ],
      });
      const block = doc.blocks[0];
      expect(block.parameters).toHaveLength(3);
      expect(block.parameters[0].name).toBe("retries");
      expectType(block.parameters[0].type as TypeExpr, t("Int"));
      expect(block.parameters[1].name).toBe("ratio");
      expectType(block.parameters[1].type as TypeExpr, t("Double"));
      expect(block.parameters[2].name).toBe("customFlag");
      expectType(block.parameters[2].type as TypeExpr, t("Bool"));
    });
  });

  describe("JSON ports, variance, and relation representation", () => {
    it("parses input/output aliases and port direction/relations", () => {
      const doc = parseCatalog("ports.json", {
        id: "ports_test",
        name: "Ports",
        blocks: [
          {
            id: "b_rel_port",
            name: "RelPort",
            ns: "test",
            inputs: [
              { name: "in1", type: "Double", icon: "pin" },
              { name: "in2", type: "Int" },
            ],
            outputs: [{ name: "out1", type: "Double", icon: "out_pin", relation: "intersection", relatesTo: "in1,in2" }],
          },
        ],
      });
      const block = doc.blocks[0];
      expect(block.inputs).toHaveLength(2);
      expect(block.outputs).toHaveLength(1);

      expect(block.inputs[0].name).toBe("in1");
      expect(block.inputs[0].direction).toBe("in");
      expect(block.inputs[0].icon).toBe("pin");

      expect(block.inputs[1].name).toBe("in2");
      expect(block.inputs[1].direction).toBe("in");

      expect(block.outputs[0].name).toBe("out1");
      expect(block.outputs[0].direction).toBe("out");
      expect(block.outputs[0].relation).toBe("intersection");
      expect(block.outputs[0].relatesTo).toBe("in1,in2");
    });

    it("parses type parameter variance, super, and relation attributes", () => {
      const doc = parseCatalog("poly.json", {
        id: "type_params",
        name: "TypeParams",
        blocks: [
          {
            id: "b_poly",
            name: "Poly",
            ns: "test",
            params: [{ name: "T", variance: "+", relation: "intersection", extends: "Rec[T]", super: "Int" }],
          },
        ],
      });
      const param = doc.blocks[0].params[0];
      expect(param.name).toBe("T");
      expect(param.variance).toBe("+");
      expect(param.relation).toBe("intersection");
      expect(param.extends).toHaveLength(1);
      expect(param.super).toHaveLength(1);
      expectType(param.super![0], t("Int"));
    });

    it("parses relation entries in blocks", () => {
      const doc = parseCatalog("rel.json", {
        id: "rel_doc",
        name: "RelDoc",
        blocks: [
          {
            id: "b_intersect_block",
            name: "IntersectBlock",
            ns: "test",
            in: [{ name: "inA", type: "Double" }, { name: "inB", type: "Int" }],
            out: [{ name: "res", type: "Unit" }],
            relations: [
              { kind: "intersection", from: "inA,inB", to: "res" },
              { kind: "union", input: "inA,inB", output: "res2" },
            ],
          },
        ],
      });
      const block = doc.blocks[0];
      expect(block.relations).toBeDefined();
      expect(block.relations).toHaveLength(2);

      const rel1 = block.relations![0];
      expect(rel1.kind).toBe("intersection");
      expect(rel1.from).toBe("inA,inB");
      expect(rel1.to).toBe("res");

      const rel2 = block.relations![1];
      expect(rel2.kind).toBe("union");
      expect(rel2.input).toBe("inA,inB");
      expect(rel2.output).toBe("res2");
    });
  });

  describe("direct type intersection inference", () => {
    it("infers intersection of distinct types in canonical order", () => {
      const ab = inferIntersection([t("Double"), t("Int")]);
      expect(ab.kind).toBe("intersection");
      expect(typeToString(ab)).toBe("Double & Int");

      // Canonical order regardless of input argument order
      const ba = inferIntersection([t("Int"), t("Double")]);
      expect(typesEqual(ab, ba)).toBe(true);
    });

    it("infers intersection of three or more types", () => {
      const abc = inferIntersection([t("String"), t("Int"), t("Double")]);
      expect(abc.kind).toBe("intersection");
      expect(typeToString(abc)).toBe("Double & Int & String");
    });

    it("deduplicates identical types in intersection (idempotence)", () => {
      const single = inferIntersection([t("Int"), t("Int"), t("Int")]);
      expect(single.kind).toBe("type");
      expectType(single, t("Int"));
    });

    it("flattens nested intersections (associativity)", () => {
      const nested1 = intersectionOf([t("Int"), t("Double")]);
      const nested2 = intersectionOf([t("String"), t("Bool")]);
      const combined = inferIntersection([nested1, nested2]);
      expect(typeToString(combined)).toBe("Bool & Double & Int & String");
    });

    it("eliminates holes in intersections when concrete types are present", () => {
      const withHole = inferIntersection([t("Int"), unbounded()]);
      expectType(withHole, t("Int"));

      const multipleWithHole = inferIntersection([t("Double"), unbounded(), t("String")]);
      expect(typeToString(multipleWithHole)).toBe("Double & String");
    });

    it("preserves hole when all operands are holes", () => {
      const allHoles = inferIntersection([unbounded(), unbounded()]);
      expect(allHoles.kind).toBe("hole");
    });

    it("handles empty operand list", () => {
      const empty = inferIntersection([]);
      expect(empty.kind).toBe("hole");
    });

    it("infers intersection of function/consumer types", () => {
      const c1 = consumerType(t("Double"));
      const c2 = consumerType(t("Int"));
      const inter = inferIntersection([c1, c2]);
      expect(inter.kind).toBe("intersection");
      expect(typeToString(inter)).toBe("(Double) -> void & (Int) -> void");
    });


    it("infers intersection with inferCommonType helper", () => {
      const res = inferCommonType([t("A"), t("B")], { strategy: "intersection" });
      expect(typeToString(res)).toBe("A & B");

      const uRes = inferCommonType([t("A"), t("B")], { strategy: "union" });
      expect(typeToString(uRes)).toBe("A | B");
    });
  });

  describe("subtype simplification in intersections and unions", () => {
    function setupSubtypeCatalog(): Catalog {
      const cat = new Catalog();
      cat.addJson("shapes.json", {
        id: "shapes",
        name: "Shapes",
        types: [
          { name: "Shape", ns: "shapes" },
          { name: "Polygon", ns: "shapes", extends: "shapes.Shape" },
          { name: "Triangle", ns: "shapes", extends: "shapes.Polygon" },
        ],
      });
      return cat;
    }

    it("simplifies intersection of Sub & Super to Sub", () => {
      const cat = setupSubtypeCatalog();
      const polygon = t("shapes.Polygon");
      const shape = t("shapes.Shape");
      const simplified = simplifyIntersection([shape, polygon], cat);
      expectType(simplified, polygon);
    });

    it("simplifies 3-level inheritance hierarchy to the most specific leaf", () => {
      const cat = setupSubtypeCatalog();
      const shape = t("shapes.Shape");
      const polygon = t("shapes.Polygon");
      const triangle = t("shapes.Triangle");
      const simplified = simplifyIntersection([shape, polygon, triangle], cat);
      expectType(simplified, triangle);
    });

    it("preserves intersection when types have no subtype relationship", () => {
      const cat = setupSubtypeCatalog();
      const shape = t("shapes.Shape");
      const str = t("String");
      const simplified = simplifyIntersection([shape, str], cat);
      expect(simplified.kind).toBe("intersection");
      expect(typeToString(simplified)).toBe("shapes.Shape & String");
    });

    it("simplifies union of Sub | Super to Super", () => {
      const cat = setupSubtypeCatalog();
      const polygon = t("shapes.Polygon");
      const shape = t("shapes.Shape");
      const simplified = simplifyUnion([shape, polygon], cat);
      expectType(simplified, shape);
    });
  });

  describe("block type parameter inference as intersection across inputs", () => {
    it("infers generic parameter T as intersection when grounded by two inputs", () => {
      const cat = new Catalog();
      cat.addJson("merge.json", {
        id: "b_test",
        name: "Test",
        blocks: [
          {
            id: "b_merge",
            name: "Merge",
            ns: "test",
            params: ["T"],
            in: [{ name: "in1", type: "T" }, { name: "in2", type: "T" }],
            out: [{ name: "out", type: "T" }],
          },
        ],
      });
      const resolved = resolveBlock(
        cat,
        "b_merge",
        new Map([
          ["in1", { kind: "single", ty: t("Double") }],
          ["in2", { kind: "single", ty: t("Int") }],
        ]),
      );
      expectType(resolved.params.get("T"), intersectionOf([t("Double"), t("Int")]));
      expectType(resolvedOutput(resolved, "out"), intersectionOf([t("Double"), t("Int")]));
      expect(resolved.compatible.get("in1")).toBe(true);
      expect(resolved.compatible.get("in2")).toBe(true);
    });

    it("infers generic parameter T as intersection across three inputs", () => {
      const cat = new Catalog();
      cat.addJson("merge3.json", {
        id: "b_test",
        name: "Test",
        blocks: [
          {
            id: "b_merge3",
            name: "Merge3",
            ns: "test",
            params: ["T"],
            in: [{ name: "in1", type: "T" }, { name: "in2", type: "T" }, { name: "in3", type: "T" }],
            out: [{ name: "out", type: "T" }],
          },
        ],
      });
      const resolved = resolveBlock(
        cat,
        "b_merge3",
        new Map([
          ["in1", { kind: "single", ty: t("Double") }],
          ["in2", { kind: "single", ty: t("Int") }],
          ["in3", { kind: "single", ty: t("String") }],
        ]),
      );
      expectType(resolved.params.get("T"), intersectionOf([t("Double"), t("Int"), t("String")]));
      expectType(resolvedOutput(resolved, "out"), intersectionOf([t("Double"), t("Int"), t("String")]));
    });

    it("simplifies intersection when inputs have a subtyping relation", () => {
      const cat = new Catalog();
      cat.addJson("subtypes.json", {
        id: "sub_mod",
        name: "SubMod",
        types: [
          { name: "Base", ns: "sub" },
          { name: "Derived", ns: "sub", extends: "sub.Base" },
        ],
        blocks: [
          {
            id: "b_sub_merge",
            name: "SubMerge",
            ns: "sub",
            params: ["T"],
            in: [{ name: "in1", type: "T" }, { name: "in2", type: "T" }],
            out: [{ name: "out", type: "T" }],
          },
        ],
      });
      const resolved = resolveBlock(
        cat,
        "b_sub_merge",
        new Map([
          ["in1", { kind: "single", ty: t("sub.Base") }],
          ["in2", { kind: "single", ty: t("sub.Derived") }],
        ]),
      );
      // Derived <: Base, so Derived & Base simplifies to Derived
      expectType(resolved.params.get("T"), t("sub.Derived"));
      expectType(resolvedOutput(resolved, "out"), t("sub.Derived"));
    });

    it("respects explicit strategy in ResolveOptions", () => {
      const cat = new Catalog();
      cat.addJson("opt.json", {
        id: "opt",
        name: "Opt",
        blocks: [
          {
            id: "b_opt",
            name: "Opt",
            ns: "test",
            params: ["T"],
            in: [{ name: "in1", type: "T" }, { name: "in2", type: "T" }],
            out: [{ name: "out", type: "T" }],
          },
        ],
      });
      const block = cat.block("b_opt")!;
      const resolver = new TypeResolver(cat);
      const grounding = new Map<string, Grounding>([
        ["in1", { kind: "single", ty: t("Double") }],
        ["in2", { kind: "single", ty: t("Int") }],
      ]);

      const resolvedIntersection = resolver.resolve(block, grounding, {
        commonTypeStrategy: "intersection",
      });
      expectType(resolvedIntersection.params.get("T"), intersectionOf([t("Double"), t("Int")]));

      const resolvedUnion = resolver.resolve(block, grounding, {
        commonTypeStrategy: "union",
      });
      expectType(resolvedUnion.params.get("T"), unionOf([t("Double"), t("Int")]));
    });

    it("respects param relation='intersection' on vararg input", () => {
      const cat = new Catalog();
      cat.addJson("param_rel.json", {
        id: "pr",
        name: "PR",
        blocks: [
          {
            id: "b_inter_varargs",
            name: "InterVarargs",
            ns: "test",
            params: [{ name: "T", relation: "intersection" }],
            in: [{ name: "elems", type: "T", vararg: true }],
            out: [{ name: "result", type: { name: "Array", args: ["T"] } }],
          },
        ],
      });
      const resolved = resolveBlock(
        cat,
        "b_inter_varargs",
        new Map([["elems", { kind: "varargs", items: [t("Double"), t("Int")] }]]),
      );
      expectType(
        resolvedOutput(resolved, "result"),
        arrayOf(intersectionOf([t("Double"), t("Int")])),
      );
    });
  });

  describe("explicit relations between input and output types", () => {
    it("infers output type as intersection via relation kind intersection", () => {
      const cat = new Catalog();
      cat.addJson("rel_block.json", {
        id: "rb",
        name: "RB",
        blocks: [
          {
            id: "b_rel_inter",
            name: "RelInter",
            ns: "test",
            in: [{ name: "a", type: "Double" }, { name: "b", type: "Int" }],
            out: [{ name: "out", type: "_" }],
            relations: [{ kind: "intersection", from: "a,b", to: "out" }],
          },
        ],
      });
      const resolved = resolveBlock(
        cat,
        "b_rel_inter",
        new Map([
          ["a", { kind: "single", ty: t("Double") }],
          ["b", { kind: "single", ty: t("Int") }],
        ]),
      );
      expectType(resolvedOutput(resolved, "out"), intersectionOf([t("Double"), t("Int")]));
    });

    it("infers output type as union via relation kind union", () => {
      const cat = new Catalog();
      cat.addJson("rel_union.json", {
        id: "ru",
        name: "RU",
        blocks: [
          {
            id: "b_rel_union",
            name: "RelUnion",
            ns: "test",
            in: [{ name: "x", type: "Float" }, { name: "y", type: "Double" }],
            out: [{ name: "out", type: "_" }],
            relations: [{ kind: "union", from: "x,y", to: "out" }],
          },
        ],
      });
      const resolved = resolveBlock(
        cat,
        "b_rel_union",
        new Map([
          ["x", { kind: "single", ty: t("Float") }],
          ["y", { kind: "single", ty: t("Double") }],
        ]),
      );
      expectType(resolvedOutput(resolved, "out"), unionOf([t("Double"), t("Float")]));
    });

    it("infers output type via port relatesTo and relation attributes", () => {
      const cat = new Catalog();
      cat.addJson("port_rel.json", {
        id: "pr2",
        name: "PR2",
        blocks: [
          {
            id: "b_port_rel",
            name: "PortRel",
            ns: "test",
            in: [{ name: "inA", type: "String" }, { name: "inB", type: "Int" }],
            out: [{ name: "res", type: "_", relation: "intersection", relatesTo: "inA,inB" }],
          },
        ],
      });
      const resolved = resolveBlock(
        cat,
        "b_port_rel",
        new Map([
          ["inA", { kind: "single", ty: t("String") }],
          ["inB", { kind: "single", ty: t("Int") }],
        ]),
      );
      expectType(resolvedOutput(resolved, "res"), intersectionOf([t("Int"), t("String")]));
    });

    it("infers output type via identity relation", () => {
      const cat = new Catalog();
      cat.addJson("id_rel.json", {
        id: "idr",
        name: "IDR",
        blocks: [
          {
            id: "b_ident_rel",
            name: "IdentRel",
            ns: "test",
            in: [{ name: "source", type: { name: "Array", args: ["Int"] } }],
            out: [{ name: "dest", type: "_" }],
            relations: [{ kind: "identity", from: "source", to: "dest" }],
          },
        ],
      });
      const resolved = resolveBlock(
        cat,
        "b_ident_rel",
        new Map([["source", { kind: "single", ty: arrayOf(t("Int")) }]]),
      );
      expectType(resolvedOutput(resolved, "dest"), arrayOf(t("Int")));
    });
  });

  describe("compatibility and propagation of inferred intersection types", () => {
    it("inferred intersection type is compatible with inputs expecting member types", () => {
      const cat = catalog();
      const inter = intersectionOf([t("Double"), t("Int")]);

      // A & B satisfies formal A
      expect(isCompatible(cat, [], t("Double"), inter)).toBe(true);
      // A & B satisfies formal B
      expect(isCompatible(cat, [], t("Int"), inter)).toBe(true);
      // A & B satisfies formal A & B
      expect(isCompatible(cat, [], inter, inter)).toBe(true);
      // A does not satisfy formal A & B
      expect(isCompatible(cat, [], inter, t("Double"))).toBe(false);
      expect(isCompatible(cat, [], inter, t("Int"))).toBe(false);
      // Independent type C is incompatible
      expect(isCompatible(cat, [], t("String"), inter)).toBe(false);
    });

    it("wires inferred intersection into downstream blocks in a diagram", () => {
      const sys = {
        id: "sys",
        name: "Sys",
        types: [{ name: "Double" }, { name: "Int" }, { name: "String" }],
        blocks: [
          { id: "source_double", name: "SourceDouble", ns: "sys", out: [{ name: "val", type: "Double" }] },
          { id: "source_int", name: "SourceInt", ns: "sys", out: [{ name: "val", type: "Int" }] },
          {
            id: "combiner",
            name: "Combiner",
            ns: "sys",
            params: ["T"],
            in: [{ name: "in1", type: "T" }, { name: "in2", type: "T" }],
            out: [{ name: "out", type: "T" }],
          },
          { id: "sink_double", name: "SinkDouble", ns: "sys", in: [{ name: "in", type: "Double" }] },
          { id: "sink_int", name: "SinkInt", ns: "sys", in: [{ name: "in", type: "Int" }] },
        ],
      };
      const cat = new Catalog();
      cat.addJson("system.json", sys);

      const diagram = new Diagram("d_sys", "SysDiagram");
      diagram.associateJson("system.json", sys);


      const dId = diagram.addNode("source_double");
      const iId = diagram.addNode("source_int");
      const cId = diagram.addNode("combiner");
      const sinkDId = diagram.addNode("sink_double");
      const sinkIId = diagram.addNode("sink_int");

      diagram.addLink(dId, "val", cId, "in1");
      diagram.addLink(iId, "val", cId, "in2");
      diagram.addLink(cId, "out", sinkDId, "in");
      diagram.addLink(cId, "out", sinkIId, "in");

      const resolvedCombiner = diagram.resolveNode(cId)!;
      const expectedInter = intersectionOf([t("Double"), t("Int")]);
      expectType(resolvedOutput(resolvedCombiner, "out"), expectedInter);

      const resolvedSinkD = diagram.resolveNode(sinkDId)!;
      expect(resolvedSinkD.compatible.get("in")).toBe(true);

      const resolvedSinkI = diagram.resolveNode(sinkIId)!;
      expect(resolvedSinkI.compatible.get("in")).toBe(true);
    });
  });

  describe("parameterized types with constraints, and wildcard variance", () => {
    it("types.json defines primitive types, standard types, Array, and function types like c1<T>", () => {
      const cat = new Catalog();
      cat.addJson("types.json", TYPES_JSON);

      const c1Def = cat.findType("c1");
      expect(c1Def).toBeDefined();
      expect(c1Def!.vars.length).toBe(1);
      expect(c1Def!.vars[0]!.name).toBe("T");

      // c1 is a consumer type and push wire type
      expect(isConsumerType(named("c1"))).toBe(true);
      expect(isConsumerType(generic("c1", [t("f64")]))).toBe(true);
      expect(isPushType(generic("c1", [t("f64")]))).toBe(true);
      expect(isPushType(arrayOf(generic("c1", [t("f64")])))).toBe(true);
    });

    it("parses type elements with generics, wildcards, and intersections", () => {
      const doc = parseCatalog("test.json", {
        id: "test",
        name: "Test",
        blocks: [
          {
            id: "b1",
            name: "B1",
            ns: "test",
            in: [
              { name: "p1", type: { name: "c1", args: ["f64"] } },
              { name: "p2", type: { name: "Animal", args: [{ wildcard: true, variance: "+", bound: "Genotype" }] } },
              { name: "p3", type: { name: "Animal", args: [{ wildcard: true, variance: "-", bound: "Cat" }] } },
              { name: "p4", type: { name: "Animal", args: [{ wildcard: true }] } },
              { name: "p5", type: { name: "Box", args: [{ name: "Box", args: ["T"] }] } },
              { name: "p6", type: { name: "Box", args: [{ intersection: ["Reader", "Writer"] }] } },
            ],
          },
        ],
      });
      const b1 = doc.blocks[0]!;
      const p1 = b1.inputs[0]!.ty;
      expect(p1.kind).toBe("type");
      expect((p1 as any).name).toBe("c1");
      expect((p1 as any).args.length).toBe(1);
      expectType((p1 as any).args[0], t("f64"));

      const p2 = b1.inputs[1]!.ty;
      expect(p2.kind).toBe("type");
      const arg2 = (p2 as any).args[0];
      expect(arg2.kind).toBe("wildcard");
      expect(arg2.boundKind).toBe("extends");
      expectType(arg2.bound, t("Genotype"));
      expect(arg2.display(true)).toBe("? extends Genotype");

      const p3 = b1.inputs[2]!.ty;
      expect(p3.kind).toBe("type");
      const arg3 = (p3 as any).args[0];
      expect(arg3.kind).toBe("wildcard");
      expect(arg3.boundKind).toBe("super");
      expectType(arg3.bound, t("Cat"));
      expect(arg3.display(true)).toBe("? super Cat");

      const p4 = b1.inputs[3]!.ty;
      expect(p4.kind).toBe("type");
      const arg4 = (p4 as any).args[0];
      expect(arg4.kind).toBe("wildcard");
      expect(arg4.boundKind).toBeNull();
      expect(arg4.bound).toBeNull();
      expect(arg4.display(true)).toBe("?");

      const p5 = b1.inputs[4]!.ty;
      expect(p5.kind).toBe("type");
      expect((p5 as any).args[0].kind).toBe("type");
      expect((p5 as any).args[0].name).toBe("Box");

      const p6 = b1.inputs[5]!.ty;
      expect(p6.kind).toBe("type");
      expect((p6 as any).args[0].kind).toBe("intersection");
    });

    it("types can have type parameters and constraints without variance: Animal<X extends Genotype>, Cat<X extends Genotype> extends Animal<X>", () => {
      const cat = new Catalog();
      cat.addJson("animals.json", {
        id: "animals",
        name: "Animals",
        types: [
          { name: "Genotype" },
          { name: "CatGenotype", extends: "Genotype" },
          { name: "DogGenotype", extends: "Genotype" },
          { name: "Animal", params: [{ name: "X", extends: "Genotype" }] },
          { name: "Cat", params: [{ name: "X", extends: "Genotype" }], extends: { name: "Animal", args: ["X"] } },
        ],
      });

      const animalDef = cat.findType("Animal");
      expect(animalDef).toBeDefined();
      expect(animalDef!.vars.length).toBe(1);
      expect(animalDef!.vars[0]!.name).toBe("X");
      expect(animalDef!.vars[0]!.extends.length).toBe(1);
      expectType(animalDef!.vars[0]!.extends[0]!, t("Genotype"));
      // No variance on types!
      expect(animalDef!.vars[0]!.variance).toBeUndefined();

      const catDef = cat.findType("Cat");
      expect(catDef).toBeDefined();
      expect(catDef!.ancestors.length).toBe(1);

      // Cat<CatGenotype> projects to Animal<CatGenotype>
      const supertype = cat.asSupertype(generic("Cat", [t("CatGenotype")]), "Animal");
      expect(supertype).toBeDefined();
      expectType(supertype!, generic("Animal", [t("CatGenotype")]));

      // Cat<CatGenotype> is a subtype of Animal<CatGenotype>
      expect(isCompatible(cat, [], generic("Animal", [t("CatGenotype")]), generic("Cat", [t("CatGenotype")]))).toBe(true);

      // Invariance: Cat<CatGenotype> is NOT a subtype of Animal<DogGenotype>
      expect(isCompatible(cat, [], generic("Animal", [t("DogGenotype")]), generic("Cat", [t("CatGenotype")]))).toBe(false);
    });

    it("wildcard variance: only wildcards have variance, enabling use-site covariance and contravariance", () => {
      const cat = new Catalog();
      cat.addJson("wildcards.json", {
        id: "wildcards",
        name: "Wildcards",
        types: [
          { name: "Genotype" },
          { name: "CatGenotype", extends: "Genotype" },
          { name: "PersianGenotype", extends: "CatGenotype" },
          { name: "Animal", params: [{ name: "X", extends: "Genotype" }] },
          { name: "Cat", params: [{ name: "X", extends: "Genotype" }], extends: { name: "Animal", args: ["X"] } },
        ],
      });

      // Invariance without wildcards:
      // Animal<Genotype> requires Animal<Genotype> exactly, Animal<CatGenotype> cannot be passed
      expect(isCompatible(cat, [], generic("Animal", [t("Genotype")]), generic("Animal", [t("CatGenotype")]))).toBe(false);

      // Covariant wildcard: Animal<? extends Genotype> accepts Animal<CatGenotype>
      const upperWild = generic("Animal", [wildcardExtends(t("Genotype"))]);
      expect(isCompatible(cat, [], upperWild, generic("Animal", [t("CatGenotype")]))).toBe(true);
      expect(isCompatible(cat, [], upperWild, generic("Animal", [t("PersianGenotype")]))).toBe(true);
      // It also accepts through Cat's inheritance hierarchy: Cat<PersianGenotype> <: Animal<? extends Genotype>!
      expect(isCompatible(cat, [], upperWild, generic("Cat", [t("PersianGenotype")]))).toBe(true);

      // Contravariant wildcard: Animal<? super CatGenotype>
      const lowerWild = generic("Animal", [wildcardSuper(t("CatGenotype"))]);
      // Accepts CatGenotype
      expect(isCompatible(cat, [], lowerWild, generic("Animal", [t("CatGenotype")]))).toBe(true);
      // Accepts supertype Genotype
      expect(isCompatible(cat, [], lowerWild, generic("Animal", [t("Genotype")]))).toBe(true);
      // Rejects subtype PersianGenotype
      expect(isCompatible(cat, [], lowerWild, generic("Animal", [t("PersianGenotype")]))).toBe(false);

      // Unbounded wildcard: Animal<?> accepts any type argument
      const unboundedWild = generic("Animal", [wildcard()]);
      expect(isCompatible(cat, [], unboundedWild, generic("Animal", [t("CatGenotype")]))).toBe(true);
      expect(isCompatible(cat, [], unboundedWild, generic("Animal", [t("Genotype")]))).toBe(true);
      expect(isCompatible(cat, [], unboundedWild, generic("Cat", [t("PersianGenotype")]))).toBe(true);
    });

    it("block can have type variables with constraints", () => {
      const cat = new Catalog();
      cat.addJson("block_vars.json", {
        id: "test_block_vars",
        name: "TestBlockVars",
        types: [
          { name: "Genotype" },
          { name: "CatGenotype", extends: "Genotype" },
          { name: "String" },
        ],
        blocks: [
          {
            id: "b_process_gene",
            name: "ProcessGene",
            ns: "test",
            vars: [{ name: "T", extends: "Genotype" }],
            in: [{ name: "gene", type: "T" }],
            out: [{ name: "result", type: "T" }],
          },
        ],
      });

      const block = cat.block("b_process_gene")!;
      expect(block).toBeDefined();
      expect(block.vars.length).toBe(1);
      expect(block.vars[0]!.name).toBe("T");
      expect(block.vars[0]!.extends.length).toBe(1);
      expectType(block.vars[0]!.extends[0]!, t("Genotype"));

      const resolver = new TypeResolver(cat);

      // Compatible with CatGenotype (satisfies extends="Genotype")
      const resolvedValid = resolver.resolve(block, new Map([["gene", { kind: "single", ty: t("CatGenotype") }]]));
      expect(resolvedValid.compatible.get("gene")).toBe(true);
      expectType(resolvedValid.params.get("T"), t("CatGenotype"));
      expectType(resolvedOutput(resolvedValid, "result"), t("CatGenotype"));

      // Incompatible with String (does not satisfy extends="Genotype")
      const resolvedInvalid = resolver.resolve(block, new Map([["gene", { kind: "single", ty: t("String") }]]));
      expect(resolvedInvalid.compatible.get("gene")).toBe(false);
    });

    it("each input can define its type via block type variable, raw type, intersection, and parameterized type with all forms", () => {
      const cat = new Catalog();
      cat.addJson("all_input_forms.json", {
        id: "input_forms",
        name: "InputForms",
        types: [
          { name: "Genotype" },
          { name: "Cat", extends: "Genotype" },
          { name: "Reader" },
          { name: "Writer" },
          { name: "f64" },
          { name: "Animal", params: [{ name: "X", extends: "Genotype" }] },
          { name: "Box", params: ["T"] },
        ],
        blocks: [
          {
            id: "b_all_forms",
            name: "AllForms",
            ns: "test",
            vars: [{ name: "V", extends: "Genotype" }],
            in: [
              { name: "p_var", type: "V" },
              { name: "p_raw", type: "f64" },
              { name: "p_inter", type: { intersection: ["Reader", "Writer"] } },
              { name: "p_param_nested", type: { name: "Box", args: [{ name: "Box", args: ["V"] }] } },
              { name: "p_param_var", type: { name: "Box", args: ["V"] } },
              { name: "p_param_raw", type: { name: "Box", args: ["f64"] } },
              { name: "p_param_wild_upper", type: { name: "Animal", args: [{ wildcard: true, variance: "+", bound: "Genotype" }] } },
              { name: "p_param_wild_lower", type: { name: "Animal", args: [{ wildcard: true, variance: "-", bound: "Cat" }] } },
              { name: "p_param_wild_unbounded", type: { name: "Animal", args: [{ wildcard: true }] } },
              { name: "p_param_inter", type: { name: "Box", args: [{ intersection: ["Reader", "Writer"] }] } },
            ],
          },
        ],
      });

      const block = cat.block("b_all_forms")!;
      expect(block).toBeDefined();
      expect(block.inputs.length).toBe(10);

      // Verify each parsed input type matches expectations
      expect(blockInput(block, "p_var")!.ty.equals(t("V"))).toBe(true);
      expect(blockInput(block, "p_raw")!.ty.equals(t("f64"))).toBe(true);
      expect(blockInput(block, "p_inter")!.ty.kind).toBe("intersection");

      const pNested = blockInput(block, "p_param_nested")!.ty;
      expect(pNested.kind).toBe("type");
      expect((pNested as any).args[0].kind).toBe("type");

      const pWildUpper = blockInput(block, "p_param_wild_upper")!.ty;
      expect((pWildUpper as any).args[0].kind).toBe("wildcard");
      expect((pWildUpper as any).args[0].boundKind).toBe("extends");

      const pWildLower = blockInput(block, "p_param_wild_lower")!.ty;
      expect((pWildLower as any).args[0].kind).toBe("wildcard");
      expect((pWildLower as any).args[0].boundKind).toBe("super");

      const pWildUnbounded = blockInput(block, "p_param_wild_unbounded")!.ty;
      expect((pWildUnbounded as any).args[0].kind).toBe("wildcard");
      expect((pWildUnbounded as any).args[0].boundKind).toBeNull();

      const pParamInter = blockInput(block, "p_param_inter")!.ty;
      expect((pParamInter as any).args[0].kind).toBe("intersection");

      // Verify compatibility check against various inputs
      const resolver = new TypeResolver(cat);
      const grounded = new Map<string, Grounding>([
        ["p_var", { kind: "single", ty: t("Cat") }],
        ["p_raw", { kind: "single", ty: t("f64") }],
        ["p_param_wild_upper", { kind: "single", ty: generic("Animal", [t("Cat")]) }],
        ["p_param_wild_lower", { kind: "single", ty: generic("Animal", [t("Genotype")]) }],
        ["p_param_wild_unbounded", { kind: "single", ty: generic("Animal", [t("Cat")]) }],
      ]);

      const resolved = resolver.resolve(block, grounded);
      expect(resolved.compatible.get("p_var")).toBe(true);
      expect(resolved.compatible.get("p_raw")).toBe(true);
      expect(resolved.compatible.get("p_param_wild_upper")).toBe(true);
      expect(resolved.compatible.get("p_param_wild_lower")).toBe(true);
      expect(resolved.compatible.get("p_param_wild_unbounded")).toBe(true);
      expectType(resolved.params.get("V"), t("Cat"));
    });

    it("type resolver infers type variables through c1<T> and functions", () => {
      const cat = new Catalog();
      cat.addJson("types.json", TYPES_JSON);
      cat.addJson("fn_blocks.json", {
        id: "fn_blocks",
        name: "FnBlocks",
        blocks: [
          {
            id: "b_c1_consumer",
            name: "C1Consumer",
            ns: "test",
            vars: ["T"],
            in: [{ name: "fn", type: { name: "c1", args: ["T"] } }],
            out: [{ name: "echo", type: { name: "c1", args: ["T"] } }],
          },
        ],
      });

      const block = cat.block("b_c1_consumer")!;
      expect(block).toBeDefined();

      const resolver = new TypeResolver(cat);

      // 1. Grounding c1<T> with c1<f64>
      const res1 = resolver.resolve(block, new Map([["fn", { kind: "single", ty: generic("c1", [t("f64")]) }]]));
      expect(res1.compatible.get("fn")).toBe(true);
      expectType(res1.params.get("T"), t("f64"));
      expectType(resolvedOutput(res1, "echo"), funcType([t("f64")], t("void")));

      // 2. Grounding c1<T> with (f64) -> void
      const res2 = resolver.resolve(block, new Map([["fn", { kind: "single", ty: funcType([t("f64")], t("void")) }]]));
      expect(res2.compatible.get("fn")).toBe(true);
      expectType(res2.params.get("T"), t("f64"));
      expectType(resolvedOutput(res2, "echo"), funcType([t("f64")], t("void")));
    });

    it("type resolver infers type variables from wildcard bounds", () => {
      const cat = new Catalog();
      cat.addJson("wildcard_infer.json", {
        id: "wild_infer",
        name: "WildcardInfer",
        types: [
          { name: "Genotype" },
          { name: "Cat", extends: "Genotype" },
          { name: "Animal", params: [{ name: "X", extends: "Genotype" }] },
        ],
        blocks: [
          {
            id: "b_wild_block",
            name: "WildBlock",
            ns: "test",
            vars: [{ name: "T", extends: "Genotype" }],
            in: [{ name: "animal", type: { name: "Animal", args: [{ wildcard: true, variance: "+", bound: "T" }] } }],
            out: [{ name: "out", type: "T" }],
          },
        ],
      });

      const block = cat.block("b_wild_block")!;
      const resolver = new TypeResolver(cat);

      const res = resolver.resolve(
        block,
        new Map([["animal", { kind: "single", ty: generic("Animal", [t("Cat")]) }]]),
      );
      expect(res.compatible.get("animal")).toBe(true);
      expectType(res.params.get("T"), t("Cat"));
      expectType(resolvedOutput(res, "out"), t("Cat"));
    });
  });
});


