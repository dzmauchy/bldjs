import { describe, expect, it } from "vitest";
import {
  type TypeExpr,
  arrayOf,
  blockAttribute,
  consumerType,
  displayType,
  funcType,
  isConsumerType,
  isPushType,
  SelfType,
  typeToString,
  named,
  typesEqual,
  unbounded,
  unionOf,
  intersectionOf,
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
import { parseMoonbitType } from "./moonbit-type";
import {
  BLOCKS_PL,
  FIXTURES_PL,
  TYPES_PL,
  associateBuiltinModels,
  associateFixtureModels,
  xmlSourcesForFiles,
} from "./builtin";
import { Catalog } from "./catalog";
import { isCompatible } from "./compat";
import {
  COMBINER_IDS,
  ConstantGenerator,
  DEFAULT_PERIOD_MS,
  GENERATOR_IDS,
  GpioInGenerator,
  SampleBuf,
  sampleCap,
  compileTimer,
  CosTransformer,
  fork,
  mapOnce,
  OvershootTransformer,
  overshootStep,
  planGenerator,
  product,
  sampleOnce,
  scope,
  sin,
  SinTransformer,
  sinFunc,
  spawnTimer,
  stop,
  timer,
} from "./cs";
import { type Link, Diagram } from "./diagram";
import { parsePlCatalog } from "./parse-pl";
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

function ty(src: string): TypeExpr {
  return parseMoonbitType(src);
}

function catalog(): Catalog {
  const next = new Catalog();
  next.addPl("types.pl", TYPES_PL);
  next.addPl("fixtures.pl", FIXTURES_PL);
  next.addPl("blocks.pl", BLOCKS_PL);
  return next;
}

async function resolveBlock(cat: Catalog, id: string, grounded: Map<string, Grounding>) {
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
  it("parses blocks.md apply example", () => {
    const pl = `
      catalog(workspace_01, 'Signal Processing').
      ns(types, 'Types', none).
      block(b_apply, 'Apply', 'func.png', [ns(types), var('T', none), var('R', none)]).
      input(b_apply, fn, fn, fn([v('T')], v('R')), []).
      input(b_apply, arg, arg, v('T'), []).
      output(b_apply, result, result, v('R'), []).
    `;
    const doc = parsePlCatalog("apply.pl", pl);
    expect(doc.id).toBe("workspace_01");
    const block = doc.blocks[0];
    expect(block.vars.length).toBe(2);
    expect(block.vars.map((item) => item.name)).toEqual(["T", "R"]);
    expectType(block.inputs[0].ty, funcType([t("T")], t("R")));
    expectType(block.inputs[1].ty, t("T"));
    expectType(block.outputs[0].ty, t("R"));
  });

  it("parses MoonBit holes and arrays", () => {
    const pl = `
      catalog(w, 'Holes').
      block(b, 'W', none, [ns(test)]).
      input(b, ints, ints, array(int), []).
      input(b, consumer, consumer, fn([double], unit), []).
      input(b, unboundedInput, unboundedInput, array(top), []).
    `;
    const doc = parsePlCatalog("wild.pl", pl);
    const block = doc.blocks[0];
    expectType(block.inputs[0].ty, arrayOf(t("int")));
    expectType(block.inputs[1].ty, consumerType(t("double")));
    expectType(block.inputs[2].ty, arrayOf(unbounded()));
  });

  it("parses union intersection and self", () => {
    const pl = `
      catalog(u, 'U').
      block(b_path, path, none, [ns('example.Builder')]).
      input(b_path, segment, segment, string, []).
      input(b_path, complexPayload, complexPayload, inter(fn([v('T')], unit), fn([], v('T'))), []).
      output(b_path, result, result, union(int, int64), []).
      output(b_path, this, this, self, []).
    `;
    const doc = parsePlCatalog("u.pl", pl);
    const block = doc.blocks[0];
    expectType(block.outputs[0].ty, unionOf([t("int"), t("int64")]));
    expect(block.outputs[1].ty.kind).toBe("self");
    expect(block.inputs[1].ty.kind).toBe("intersection");
  });

  it("parses f-bounded var constraints", () => {
    const pl = `
      catalog(e, 'E').
      block(b_rec_new, 'rec.new', none, [
        ns(example),
        var('T', extends(rec(v('T')))),
        var('F', extends(h(v('F'))))
      ]).
      input(b_rec_new, cls, cls, fn([v('T')], unit), []).
      output(b_rec_new, value, value, v('T'), []).
    `;
    const doc = parsePlCatalog("e.pl", pl);
    expect(doc.blocks[0].vars[0].name).toBe("T");
    expect(doc.blocks[0].vars[0].constraint).toBe("extends(rec(T))");
    expect(doc.blocks[0].vars[1].name).toBe("F");
    expect(doc.blocks[0].vars[1].constraint).toBe("extends(h(F))");
  });

  it("parses port type constraints", () => {
    const pl = `
      catalog(c, 'C').
      block(b_cmp, 'Cmp', none, [ns(example), var('T', none)]).
      input(b_cmp, in, in, v('T'), [constraint(extends(h(v('T'))))]).
      output(b_cmp, out, out, top, [constraint(comparable(?(super(v('T')))))]).
    `;
    const doc = parsePlCatalog("c.pl", pl);
    expectType(doc.blocks[0].inputs[0].ty, t("T"));
    expect(doc.blocks[0].inputs[0].constraint).toBe("extends(h(T))");
    expect(doc.blocks[0].outputs[0].ty.kind).toBe("hole");
    expect(doc.blocks[0].outputs[0].constraint).toBe("comparable(?(super(T)))");
  });

  it("builtin models merge", () => {
    const cat = new Catalog();
    cat.addPl("types.pl", TYPES_PL);
    cat.addPl("blocks.pl", BLOCKS_PL);
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
    expect(cat.findType("double")).toBeDefined();
    expect(cat.findType("array")).toBeDefined();
    expect(cat.findType("string")).toBeDefined();
    expect(cat.findType("bool")).toBeDefined();
    expect(cat.findType("unit")).toBeDefined();
    expect(cat.findType("int")).toBeDefined();
    expect(cat.findType("c1")).toBeUndefined();
    expect(cat.findType("f64")).toBeUndefined();
    expect(cat.sources().length).toBe(2);
    expect(cat.catalogs().map((item) => [item.file, item.name])).toEqual([
      ["types.pl", "Types"],
      ["blocks.pl", "Control Systems"],
    ]);
  });

  it("looks up builtin catalogs by file name", () => {
    expect(xmlSourcesForFiles(["types.pl", "blocks.pl"]).map((source) => source.name)).toEqual([
      "types.pl",
      "blocks.pl",
    ]);
    expect(() => xmlSourcesForFiles(["missing.pl"])).toThrow("unknown catalog");
    expect(() => xmlSourcesForFiles(["models/types.pl"])).toThrow("unknown catalog");
    expect(catalog().catalogs().map((item) => item.file)).toEqual(["types.pl", "fixtures.pl", "blocks.pl"]);
  });

  it("array[double] is compatible with array[_]", () => {
    const cat = catalog();
    const formal = arrayOf(unbounded());
    const actual = arrayOf(t("double"));
    expect(isCompatible(cat, [], formal, actual)).toBe(true);
    const invariant = arrayOf(t("int"));
    expect(isCompatible(cat, [], invariant, actual)).toBe(false);
    expect(isCompatible(cat, [], t("double"), unbounded())).toBe(false);
    expect(isCompatible(cat, [], unbounded(), t("double"))).toBe(true);
  });

  it("consumers and functions are distinct MoonBit types", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], consumerType(t("double")), consumerType(t("double")))).toBe(true);
    expect(isCompatible(cat, [], consumerType(t("double")), funcType([t("double")], t("double")))).toBe(false);
    expect(isCompatible(cat, [], funcType([], t("double")), consumerType(t("double")))).toBe(false);
  });

  it("function types are contravariant in arguments", () => {
    const cat = catalog();
    const formal = consumerType(consumerType(t("double")));
    expect(isCompatible(cat, [], formal, consumerType(funcType([], t("double"))))).toBe(false);
    expect(isCompatible(cat, [], formal, consumerType(t("int")))).toBe(false);
    expect(isCompatible(cat, [], formal, consumerType(consumerType(t("double"))))).toBe(true);
  });

  it("parses array[T] MoonBit notation", () => {
    const pl = `
      catalog(a, 'A').
      block(b, 'B', none, [ns(test)]).
      input(b, sugar, sugar, array(double), []).
      input(b, nested, nested, array(array(int)), []).
      output(b, alias, alias, array(string), []).
    `;
    const doc = parsePlCatalog("arr.pl", pl);
    expectType(doc.blocks[0].inputs[0].ty, arrayOf(t("double")));
    expectType(doc.blocks[0].inputs[1].ty, arrayOf(arrayOf(t("int"))));
    expectType(doc.blocks[0].outputs[0].ty, arrayOf(t("string")));
  });

  it("catalog primitives do not widen and bool is not int", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], t("int64"), t("int"))).toBe(false);
    expect(isCompatible(cat, [], t("int"), t("int64"))).toBe(false);
    expect(isCompatible(cat, [], t("double"), t("float"))).toBe(false);
    expect(isCompatible(cat, [], t("double"), t("double"))).toBe(true);
    expect(isCompatible(cat, [], t("bool"), t("int"))).toBe(false);
    expect(isCompatible(cat, [], t("int"), t("bool"))).toBe(false);
    expect(isCompatible(cat, [], t("string"), t("int"))).toBe(false);
  });

  it("infer array of from double grounding", async () => {
    const resolved = await resolveBlock(
      catalog(),
      "b_array_of",
      new Map([["elems", { kind: "single", ty: t("double") }]]),
    );
    expectType(resolved.params.get("T"), t("double"));
    expectType(resolvedOutput(resolved, "result"), arrayOf(t("double")));
    expect(resolved.compatible.get("elems")).toBe(true);
  });

  it("infer array of vararg union", async () => {
    const resolved = await resolveBlock(
      catalog(),
      "b_array_of",
      new Map([["elems", { kind: "varargs", items: [t("double"), t("int")] }]]),
    );
    expectType(resolvedOutput(resolved, "result"), arrayOf(unionOf([t("double"), t("int")])));
  });

  it("infer (T1, T2) -> R from two inputs", async () => {
    const cat = catalog();
    cat.addPl(
      "f2.pl",
      `
        catalog(fn, 'Fn').
        block(b_apply_f2, apply2, none, [ns(test), var('T1', none), var('T2', none), var('R', none)]).
        input(b_apply_f2, fn, fn, fn([v('T1'), v('T2')], v('R')), []).
        input(b_apply_f2, a, a, v('T1'), []).
        input(b_apply_f2, b, b, v('T2'), []).
        output(b_apply_f2, result, result, v('R'), []).
      `,
    );
    const resolved = await resolveBlock(
      cat,
      "b_apply_f2",
      new Map([
        ["fn", { kind: "single", ty: funcType([t("int"), t("string")], t("bool")) }],
        ["a", { kind: "single", ty: t("int") }],
        ["b", { kind: "single", ty: t("string") }],
      ]),
    );
    expectType(resolved.params.get("T1"), t("int"));
    expectType(resolved.params.get("T2"), t("string"));
    expectType(resolved.params.get("R"), t("bool"));
    expectType(resolvedOutput(resolved, "result"), t("bool"));
  });

  it("unbound param grounds to a hole", async () => {
    const resolved = await resolveBlock(catalog(), "b_process", new Map());
    expectType(resolvedOutput(resolved, "out"), unbounded());
    expect(resolved.outputs.find((port) => port.name === "out")?.connectable).toBe(false);
  });

  it("process identity from array", async () => {
    const resolved = await resolveBlock(
      catalog(),
      "b_process",
      new Map([["in", { kind: "single", ty: arrayOf(t("double")) }]]),
    );
    expectType(resolvedOutput(resolved, "out"), arrayOf(t("double")));
  });

  it("array get infers element type", async () => {
    const resolved = await resolveBlock(
      catalog(),
      "b_array_get",
      new Map([
        ["array", { kind: "single", ty: arrayOf(t("double")) }],
        ["index", { kind: "single", ty: t("int") }],
      ]),
    );
    expectType(resolvedOutput(resolved, "elem"), t("double"));
  });

  it("f-bounded Rec resolves through a multi-file catalog", async () => {
    const cat = catalog();
    cat.addPl(
      "color.pl",
      `
        catalog(example, 'Example').
        type(rec, none).
        var(rec, 'E', extends(rec(v('E')))).
        type(color, none).
        parent(color, rec(color)).
        block(b_color_fn, 'Color.fn', none, [ns(example)]).
        output(b_color_fn, value, value, fn([color], unit), []).
        block(b_rec_new, 'rec.new', none, [ns(example), var('T', extends(rec(v('T'))))]).
        input(b_rec_new, cls, cls, fn([v('T')], unit), []).
        output(b_rec_new, value, value, v('T'), []).
      `,
    );
    const resolved = await resolveBlock(
      cat,
      "b_rec_new",
      new Map([["cls", { kind: "single", ty: consumerType(t("color")) }]]),
    );
    expectType(resolvedOutput(resolved, "value"), t("color"));
    expect(resolved.compatible.get("cls")).toBe(true);
  });

  it("incompatible grounding is reported", async () => {
    const cat = catalog();
    cat.addPl(
      "need.pl",
      `
        catalog(b, 'B').
        block(need_c1, 'Need', none, [ns(test), var('N', extends(fn([double], unit)))]).
        input(need_c1, in, in, v('N'), []).
        output(need_c1, out, out, v('N'), []).
      `,
    );
    const resolved = await resolveBlock(cat, "need_c1", new Map([["in", { kind: "single", ty: t("int") }]]));
    expect(resolved.compatible.get("in")).toBe(false);
  });

  it("builder self type is namespace", async () => {
    const cat = new Catalog();
    cat.addPl(
      "mod.pl",
      `
        catalog(mod, 'Module').
        block(b_path, path, none, [ns('example.Builder')]).
        input(b_path, segment, segment, string, []).
        output(b_path, this, this, self, []).
      `,
    );
    const resolved = await resolveBlock(cat, "b_path", new Map([["segment", { kind: "single", ty: t("string") }]]));
    expectType(resolvedOutput(resolved, "this"), t("example.Builder"));
  });

  it("diagram associates multiple xml files and grounds inputs", async () => {
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

    expectType(resolvedOutput((await diagram.resolveNode(arrayId))!, "result"), arrayOf(t("double")));
    expectType(resolvedOutput((await diagram.resolveNode(getId))!, "elem"), t("double"));
    expectType(resolvedOutput((await diagram.resolveNode(processId))!, "out"), arrayOf(t("double")));
  });

  it("diagram chain grounds through identity", async () => {
    const diagram = new Diagram("d2", "Chain");
    associateFixtureModels(diagram);
    const doubleId = diagram.addNode("b_Double");
    const identId = diagram.addNode("b_identity");
    const arrayId = diagram.addNode("b_array_of");
    diagram.addLink(doubleId, "value", identId, "in");
    diagram.addLink(identId, "out", arrayId, "elems");
    expectType(resolvedOutput((await diagram.resolveNode(arrayId))!, "result"), arrayOf(t("double")));
  });

  it("does not ground a downstream input from an unconnectable output", async () => {
    const diagram = new Diagram("d4", "Holes");
    associateFixtureModels(diagram);
    const identId = diagram.addNode("b_identity");
    const arrayId = diagram.addNode("b_array_of");
    diagram.addLink(identId, "out", arrayId, "elems");
    const ident = await diagram.resolveNode(identId);
    expect(ident?.outputs.find((port) => port.name === "out")?.connectable).toBe(false);
    const array = await diagram.resolveNode(arrayId);
    expect(array?.compatible.get("elems")).toBe(false);
    expect(array?.outputs.find((port) => port.name === "result")?.connectable).toBe(false);
  });

  it("dissociate xml rebuilds catalog", () => {
    const diagram = new Diagram("d3", "Drop");
    associateFixtureModels(diagram);
    diagram.addNode("b_array_of");
    diagram.dissociateXml("fixtures.pl");
    expect(diagram.catalog().block("b_array_of")).toBeUndefined();
    expect(diagram.catalog().block("timer")).toBeDefined();
    expect(diagram.nodes().length).toBe(0);
    expect(diagram.catalog().catalogs().map((item) => item.name)).toEqual(["Types", "Control Systems"]);
  });

  it("hole display", () => {
    expect(displayType(unbounded(), true)).toBe("_");
    expect(ty("_").kind).toBe("hole");
  });

  it("substitutes params, replaces self, and flattens unions", () => {
    const substituted = consumerType(t("T")).subst(new Map([["T", t("double")]]));
    expect(displayType(substituted, true)).toBe("(double) -> unit");
    expect(displayType(new SelfType().replaceSelf(t("int")), true)).toBe("int");
    expect(typesEqual(unionOf([t("int"), t("int")]), t("int"))).toBe(true);
    expect(consumerType(t("double")).isConsumer()).toBe(true);
    expect(arrayOf(consumerType(t("double"))).isPush()).toBe(true);
  });

  it("displays common MoonBit types", () => {
    expect(displayType(consumerType(t("double")), true)).toBe("(double) -> unit");
    expect(displayType(consumerType(consumerType(t("double"))), true)).toBe("((double) -> unit) -> unit");
    expect(displayType(consumerType(consumerType(consumerType(t("double")))), true)).toBe(
      "(((double) -> unit) -> unit) -> unit",
    );
    expect(typeToString(consumerType(consumerType(consumerType(t("double")))))).toBe(
      "(((double) -> unit) -> unit) -> unit",
    );
    expect(displayType(funcType([t("int")], t("string")), true)).toBe("(int) -> string");
    expect(displayType(funcType([t("int"), t("int64")], t("bool")), true)).toBe("(int, int64) -> bool");
    expect(displayType(funcType([], t("double")), true)).toBe("() -> double");
    expect(displayType(consumerType(t("string"), t("bool")), true)).toBe("(string, bool) -> unit");
    expect(displayType(t("double"), true)).toBe("double");
    expect(displayType(arrayOf(t("double")), true)).toBe("array[double]");
    expect(displayType(arrayOf(arrayOf(t("int"))), true)).toBe("array[array[int]]");
    expect(displayType(unionOf([t("int"), t("int64")]), true)).toBe("int | int64");
    expect(displayType(arrayOf(unionOf([t("int"), t("int64")])), true)).toBe("array[(int | int64)]");
  });

  it("control systems model and types", () => {
    const cat = catalog();
    const timerBlock = cat.block("timer")!;
    expect(timerBlock.inputs.length).toBe(1);
    expect(timerBlock.outputs.length).toBe(0);
    expect(displayType(timerBlock.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
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
    expect(displayType(scope.outputs.find((port) => port.name === "out")!.ty, true)).toBe("array[(double) -> unit]");
    expect(scope.outputs.find((port) => port.name === "out")!.attributes.find((a) => a.name === "dynamic")?.value).toBe(
      "true",
    );
    expect(displayType(cat.block("sin")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(cat.block("sin")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(cat.block("cos")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(cat.block("cos")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(cat.block("overshoot")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(cat.block("overshoot")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(cat.block("random")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(cat.block("constant")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
    expect(cat.block("constant")!.outputs).toEqual([]);
    const productBlock = cat.block("product")!;
    expect(displayType(productBlock.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(productBlock.outputs.find((port) => port.name === "out")!.ty, true)).toBe("array[(double) -> unit]");
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
    expect(displayType(gpioIn.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
    expect(gpioIn.parameters.find((param) => param.name === "pin")?.default).toBe("0");
    expect(gpioIn.parameters.find((param) => param.name === "period")).toBeUndefined();
    const gpioOut = cat.block("gpio_out")!;
    expect(gpioOut.inputs.length).toBe(0);
    expect(displayType(gpioOut.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(double) -> unit");
    expect(gpioOut.parameters.find((param) => param.name === "pin")?.default).toBe("1");
    expect(cat.findType("double")).toBeDefined();
    expect(cat.findType("array")).toBeDefined();
    expect(cat.findType("unit")).toBeDefined();
    expect(cat.findType("int")).toBeDefined();
  });

  it("nested consumers are not double sample ports", () => {
    const cat = catalog();
    const nested = consumerType(consumerType(consumerType(t("double"))));
    const mid = consumerType(consumerType(t("double")));
    const leaf = consumerType(t("double"));
    expect(isCompatible(cat, [], nested, t("double"))).toBe(false);
    expect(isCompatible(cat, [], mid, t("double"))).toBe(false);
    expect(isCompatible(cat, [], leaf, t("double"))).toBe(false);
    expect(isCompatible(cat, [], mid, nested)).toBe(false);
    expect(isCompatible(cat, [], leaf, mid)).toBe(false);
    expect(isCompatible(cat, [], nested, nested)).toBe(true);
    expect(isCompatible(cat, [], mid, mid)).toBe(true);
    expect(isCompatible(cat, [], leaf, leaf)).toBe(true);
  });

  it("(double) -> unit is a consumer type that can be forked into one input", () => {
    expect(isConsumerType(consumerType(t("double")))).toBe(true);
    expect(isConsumerType(t("double"))).toBe(false);
    expect(isConsumerType(funcType([t("double")], t("double")))).toBe(false);
  });

  it("detects push-model wires from consumers and consumer vectors", () => {
    expect(isPushType(consumerType(t("double")))).toBe(true);
    expect(isPushType(arrayOf(consumerType(t("double"))))).toBe(true);
    expect(isPushType(arrayOf(arrayOf(consumerType(t("double")))))).toBe(true);
    expect(isPushType(t("double"))).toBe(false);
    expect(isPushType(funcType([], t("double")))).toBe(false);
    expect(isPushType(funcType([t("double")], t("double")))).toBe(false);
    expect(isPushType(arrayOf(t("double")))).toBe(false);
    expect(isPushType(undefined)).toBe(false);
  });

  it("fork forwards each sample to every downstream", () => {
    const left: number[] = [];
    const right: number[] = [];
    const both = fork(
      (value) => left.push(value),
      (value) => right.push(value),
    );
    both(1);
    both(2);
    expect(left).toEqual([1, 2]);
    expect(right).toEqual([1, 2]);
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

  it("sin maps samples", () => {
    const out: number[] = [];
    const mapped = sinFunc((value) => out.push(value));
    mapped(0);
    mapped(Math.PI / 2);
    expect(Math.abs(out[0])).toBeLessThan(1e-9);
    expect(Math.abs(out[1] - 1)).toBeLessThan(1e-9);
  });

  it("transformer and generator classes share one registry", () => {
    expect(new SinTransformer().map(0)).toBe(mapOnce("sin", 0));
    expect(new CosTransformer().map(0)).toBe(mapOnce("cos", 0));
    expect(new OvershootTransformer().map(0)).toBe(mapOnce("overshoot", 0));
    expect(sampleOnce("timer", 3.25)).toBe(3.25);
    expect(sampleOnce("constant", 3.25)).toBe(1);
    expect(sampleOnce("constant", 3.25, 2.5)).toBe(2.5);
    expect(new ConstantGenerator(10, 4).sample(0)).toBe(4);
  });

  it("cos maps samples", () => {
    const out: number[] = [];
    const mapped = (value: number) => out.push(Math.cos(value));
    mapped(0);
    mapped(Math.PI);
    expect(Math.abs(out[0] - 1)).toBeLessThan(1e-9);
    expect(Math.abs(out[1] + 1)).toBeLessThan(1e-9);
  });

  it("overshoot maps the classic second-order unit step", () => {
    const zeta = 0.5;
    const omega = 2;
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const peakTime = Math.PI / wd;
    const overshoot = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
    expect(overshootStep(0, zeta, omega)).toBe(0);
    expect(overshootStep(-1, zeta, omega)).toBe(0);
    expect(overshootStep(peakTime, zeta, omega)).toBeCloseTo(1 + overshoot, 8);
    expect(overshootStep(80, zeta, omega)).toBeCloseTo(1, 5);

    const out: number[] = [];
    const mapped = new OvershootTransformer(zeta, omega).wrap((value) => out.push(value));
    mapped(10);
    mapped(10 + peakTime);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(1 + overshoot, 8);
  });

  it("overshoot peak time follows ω independently of ζ", () => {
    const zeta = 0.5;
    const overshoot = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
    const peak = (w: number) => Math.PI / (w * Math.sqrt(1 - zeta * zeta));
    expect(overshootStep(peak(1), zeta, 1)).toBeCloseTo(1 + overshoot, 8);
    expect(overshootStep(peak(4), zeta, 4)).toBeCloseTo(1 + overshoot, 8);
    expect(overshootStep(peak(1), zeta, 4)).not.toBeCloseTo(1 + overshoot, 2);
  });

  it("product updates one slot then pushes the product of all defaults", () => {
    const out: number[] = [];
    const factors = product(2, 1, (value) => out.push(value));
    factors[0]!(3);
    factors[1]!(4);
    expect(out).toEqual([3, 12]);
    factors[0]!(5);
    expect(out.at(-1)).toBe(20);
  });

  it("compile generator constant into scope", () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 3, defId: "constant", value: 2.5 },
    ];
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 3, toIn: "in" }];
    const buffers = new Map<number, SampleBuf>([[0, new SampleBuf()]]);
    const compiled = compileTimer(3, nodes, links, buffers)!;
    compiled.emit(0);
    compiled.emit(1);
    const got = buffers.get(0)!.snapshot();
    expect(got.at(-2)).toBe(2.5);
    expect(got.at(-1)).toBe(2.5);
  });

  it("compile generator product of two factors from a fork", () => {
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
    const buffers = new Map<number, SampleBuf>([[0, new SampleBuf()]]);
    const compiled = compileTimer(5, nodes, links, buffers)!;
    compiled.emit(0);
    expect(buffers.get(0)!.snapshot().at(-1)).toBeCloseTo(0, 8);
    compiled.emit(Math.PI / 4);
    expect(buffers.get(0)!.snapshot().at(-1)).toBeCloseTo(0.5, 8);
  });

  it("compile generator sines into scope", () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ];
    const buffers = new Map<number, SampleBuf>([[0, new SampleBuf()]]);
    const compiled = compileTimer(3, nodes, links, buffers)!;
    compiled.emit(0);
    compiled.emit(Math.PI / 2);
    const got = buffers.get(0)!.snapshot();
    expect(got).toHaveLength(sampleCap());
    expect(Math.abs(got.at(-2)!)).toBeLessThan(1e-9);
    expect(Math.abs(got.at(-1)! - 1)).toBeLessThan(1e-9);
    expect(compiled.delayMs).toBe(DEFAULT_PERIOD_MS);
  });

  it("compile generator overshoot into scope from the first sample", () => {
    const zeta = 0.5;
    const omega = 2;
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const peakTime = Math.PI / wd;
    const overshoot = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "overshoot", zeta, omega },
      { id: 3, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ];
    const buffers = new Map<number, SampleBuf>([[0, new SampleBuf()]]);
    const compiled = compileTimer(3, nodes, links, buffers)!;
    compiled.emit(4);
    compiled.emit(4 + peakTime);
    const got = buffers.get(0)!.snapshot();
    expect(got.at(-2)).toBe(0);
    expect(got.at(-1)).toBeCloseTo(1 + overshoot, 8);
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

  it("compile generator needs scope", () => {
    const nodes = [{ id: 4, defId: "timer" }];
    expect(planGenerator(4, nodes, [])).toBeUndefined();
    expect(compileTimer(4, nodes, [], new Map())).toBeUndefined();
  });

  it("GPIO In supplies 0 once on start", () => {
    const out: number[] = [];
    let live = true;
    new GpioInGenerator().run(
      (value) => out.push(value),
      () => {
        const next = live;
        live = false;
        return next;
      },
    );
    expect(out).toEqual([0]);
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

  it("control systems diagram grounds nested func chain", async () => {
    const diagram = new Diagram("cs", "Control Systems");
    associateBuiltinModels(diagram);
    const sinId = diagram.addNode("sin");
    const scopeId = diagram.addNode("scope");
    const timerId = diagram.addNode("timer");
    diagram.addLink(scopeId, "out", sinId, "in");
    diagram.addLink(sinId, "out", timerId, "in");

    const sinResolved = (await diagram.resolveNode(sinId))!;
    expect(sinResolved.compatible.get("in") ?? true).toBe(true);
    expect(displayType(sinResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(double) -> unit");
    expect(displayType(sinResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(double) -> unit");

    const scopeResolved = (await diagram.resolveNode(scopeId))!;
    expect(displayType(scopeResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("array[(double) -> unit]");
    expect((await diagram.resolveNode(timerId))!.compatible.get("in") ?? true).toBe(true);
  });

  it("a consumer vector may ground a (double) -> unit input", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], consumerType(t("double")), arrayOf(consumerType(t("double"))))).toBe(true);
    expect(isCompatible(cat, [], consumerType(t("double")), arrayOf(t("double")))).toBe(false);
  });

  it("two scopes may ground the same (double) -> unit input", async () => {
    const diagram = new Diagram("cs", "Fork");
    associateBuiltinModels(diagram);
    const scopeA = diagram.addNode("scope");
    const scopeB = diagram.addNode("scope");
    const sinId = diagram.addNode("sin");
    diagram.addLink(scopeA, "out", sinId, "in");
    diagram.addLink(scopeB, "out", sinId, "in");
    expect(diagram.links()).toHaveLength(2);
    expect((await diagram.resolveNode(sinId))!.compatible.get("in") ?? true).toBe(true);
  });

  it("extra slotted ports ground as the catalog consumer ports", async () => {
    const diagram = new Diagram("cs", "Slots");
    associateBuiltinModels(diagram);
    const scopeId = diagram.addNode("scope");
    const sinId = diagram.addNode("sin");
    const cosId = diagram.addNode("cos");
    diagram.addLink(scopeId, "out", sinId, "in");
    diagram.addLink(scopeId, "out[1]", cosId, "in");
    const scope = (await diagram.resolveNode(scopeId))!;
    expect(displayType(resolvedOutput(scope, "out")!, true)).toBe("(double) -> unit");
    expect(displayType(resolvedOutput(scope, "out[1]")!, true)).toBe("(double) -> unit");
    expect(isPushType(resolvedOutput(scope, "out"))).toBe(true);
    expect(isPushType(resolvedOutput(scope, "out[1]"))).toBe(true);
    expect((await diagram.resolveNode(sinId))!.compatible.get("in") ?? true).toBe(true);
    expect((await diagram.resolveNode(cosId))!.compatible.get("in") ?? true).toBe(true);
    expect(displayType(resolvedInput((await diagram.resolveNode(sinId))!, "in")!, true)).toBe("(double) -> unit");
    expect(displayType(resolvedOutput((await diagram.resolveNode(sinId))!, "out")!, true)).toBe("(double) -> unit");
    expect(displayType(resolvedInput((await diagram.resolveNode(cosId))!, "in")!, true)).toBe("(double) -> unit");
    expect(displayType(resolvedOutput((await diagram.resolveNode(cosId))!, "out")!, true)).toBe("(double) -> unit");
  });

  it("scope vector wires to sin because array[(double) -> unit] grounds (double) -> unit", async () => {
    const diagram = new Diagram("cs", "Same");
    associateBuiltinModels(diagram);
    const scopeId = diagram.addNode("scope");
    const sinId = diagram.addNode("sin");
    diagram.addLink(scopeId, "out", sinId, "in");
    expect((await diagram.resolveNode(sinId))!.compatible.get("in") ?? true).toBe(true);
  });

  it("array is incompatible with a (double) -> unit port", async () => {
    const diagram = new Diagram("cs", "Skip");
    associateFixtureModels(diagram);
    const tableId = diagram.addNode("b_array_of");
    const sinId = diagram.addNode("sin");
    diagram.addLink(tableId, "result", sinId, "in");

    const sinResolved = (await diagram.resolveNode(sinId))!;
    expect(sinResolved.compatible.get("in")).toBe(false);
  });

  it("interprets a forked pair as timer(fork(plot, plot))", () => {
    const left: number[] = [];
    const right: number[] = [];
    let live = true;
    const running = () => {
      const next = live;
      live = false;
      return next;
    };
    timer(fork(...scope((value) => left.push(value), (value) => right.push(value))), running, () => 4);
    expect(left).toEqual([4]);
    expect(right).toEqual([4]);
  });

  it("compile timer forks into two scope buffers", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "scope" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    const buffers = new Map<number, SampleBuf>([
      [0, new SampleBuf()],
      [1, new SampleBuf()],
    ]);
    const compiled = compileTimer(4, nodes, links, buffers)!;
    compiled.emit(3);
    const left = buffers.get(0)!.snapshot();
    const right = buffers.get(1)!.snapshot();
    expect(left).toHaveLength(sampleCap());
    expect(right).toHaveLength(sampleCap());
    expect(left.at(-1)).toBe(3);
    expect(right.at(-1)).toBe(3);
  });

  it("compile generator writes one ring per transformer channel", async () => {
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
    const buffers = new Map<number, SampleBuf>([
      [0, new SampleBuf()],
      [1, new SampleBuf()],
    ]);
    compileTimer(4, nodes, links, buffers)!.emit(0);
    expect(buffers.get(0)!.snapshot()).toHaveLength(sampleCap());
    expect(Math.abs(buffers.get(0)!.snapshot().at(-1)!)).toBeLessThan(1e-9);
    expect(Math.abs(buffers.get(1)!.snapshot().at(-1)! - 1)).toBeLessThan(1e-9);
  });

  it("interprets the wired chain as timer(sin(plot[0]))", () => {
    const out: number[] = [];
    let live = true;
    const running = () => {
      const next = live;
      live = false;
      return next;
    };
    timer(sin(scope((value) => out.push(value))[0]), running, () => Math.PI / 2);
    expect(out).toHaveLength(1);
    expect(Math.abs(out[0] - 1)).toBeLessThan(1e-9);
  });

  it("spawn timer emits until stopped", () => {
    const buf = new SampleBuf();
    const compiled = {
      emit: (value: number) => buf.push(value),
      delayMs: 1,
    };
    const running = { value: true };
    const halt = spawnTimer(compiled, running);
    halt();
    stop(running);
    const live = buf.snapshot();
    expect(live).toHaveLength(sampleCap());
    expect(live.some((value) => Number.isFinite(value))).toBe(true);
    buf.clear();
    const cleared = buf.snapshot();
    expect(cleared).toHaveLength(sampleCap());
    expect(cleared.every((value) => Number.isNaN(value))).toBe(true);
  });
});

describe("constants, settings, relations, and type intersection inference", () => {
  describe("constants and type guards", () => {
    it("defines and validates all primitive types", () => {
      expect(PRIMITIVE_TYPES).toEqual([
        "double",
        "float",
        "int",
        "int64",
        "uint",
        "uint64",
        "string",
        "bool",
        "byte",
        "char",
        "unit",
      ]);
      for (const prim of PRIMITIVE_TYPES) {
        expect(isPrimitiveType(prim)).toBe(true);
        expect(isPrimitive(prim)).toBe(true);
        expect(PRIMITIVES.has(prim)).toBe(true);
      }
      expect(isPrimitiveType("Unknown")).toBe(false);
      expect(isPrimitiveType("array")).toBe(false);
      expect(isPrimitive("com.dauch.cs.double")).toBe(true);
      expect(isPrimitive("com.dauch.cs.Unknown")).toBe(false);
    });

    it("defines and validates container, special, and type kinds", () => {
      expect(BUILTIN_CONTAINER_TYPES).toEqual(["array"]);
      expect(isBuiltinContainerType("array")).toBe(true);
      expect(isBuiltinContainerType("int")).toBe(false);

      expect(SPECIAL_TYPES).toEqual(["self", "_"]);
      expect(isSpecialType("self")).toBe(true);
      expect(isSpecialType("_")).toBe(true);
      expect(isSpecialType("double")).toBe(false);

      expect(TYPE_KINDS).toEqual([
        "type",
        "func",
        "tuple",
        "array",
        "union",
        "intersection",
        "hole",
        "self",
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

      expect(VARIANCE_TYPES).toEqual(["+", "-", "=", "?"]);
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

  describe("Prolog param/4 representation", () => {
    it("parses block with setting and typed param/4 facts", () => {
      const pl = `
        catalog(cfg, 'Config').
        block(b_cfg, 'ConfigBlock', none, [ns(test)]).
        param(b_cfg, bufferSize, setting, [type(int), default(1024), min(64), max(65536), step(64)]).
        param(b_cfg, threshold, setting, [type(double), default(0.75), min(0), max(1), step(0.05)]).
        param(b_cfg, mode, setting, [type(string), default(fast), pattern('[a-z]+')]).
      `;
      const doc = parsePlCatalog("cfg.pl", pl);
      const block = doc.blocks[0];
      expect(block.parameters).toHaveLength(3);
      expect(block.settings).toHaveLength(3);

      const buf = block.parameters[0];
      expect(buf.name).toBe("bufferSize");
      expect(buf.kind).toBe("setting");
      expectType(buf.type as TypeExpr, t("int"));
      expect(buf.default).toBe("1024");
      expect(buf.min).toBe(64);
      expect(buf.max).toBe(65536);
      expect(buf.step).toBe(64);

      const thresh = block.parameters[1];
      expect(thresh.name).toBe("threshold");
      expectType(thresh.type as TypeExpr, t("double"));
      expect(thresh.default).toBe("0.75");

      const mode = block.parameters[2];
      expect(mode.name).toBe("mode");
      expectType(mode.type as TypeExpr, t("string"));
      expect(mode.pattern).toBe("[a-z]+");
    });

    it("parses block with typed specific parameters", () => {
      const pl = `
        catalog(p, 'Params').
        block(b_proc, 'Proc', none, [ns(test)]).
        param(b_proc, retries, integer, [type(int), default(3)]).
        param(b_proc, ratio, double_range, [type(double), min(0.1), max(5.0), step(0.1), default(1.0)]).
        param(b_proc, customFlag, parameter, [type(bool), default(true)]).
      `;
      const doc = parsePlCatalog("p.pl", pl);
      const block = doc.blocks[0];
      expect(block.parameters).toHaveLength(3);
      expect(block.parameters[0].name).toBe("retries");
      expectType(block.parameters[0].type as TypeExpr, t("int"));
      expect(block.parameters[1].name).toBe("ratio");
      expectType(block.parameters[1].type as TypeExpr, t("double"));
      expect(block.parameters[2].name).toBe("customFlag");
      expectType(block.parameters[2].type as TypeExpr, t("bool"));
    });
  });

  describe("Prolog ports and type variables", () => {
    it("parses input/output aliases and port direction", () => {
      const pl = `
        catalog(ports_test, 'Ports').
        block(b_rel_port, 'RelPort', none, [ns(test)]).
        input(b_rel_port, in1, in1, double, [icon(pin)]).
        input(b_rel_port, in2, in2, int, []).
        output(b_rel_port, out1, out1, double, [icon(out_pin)]).
      `;
      const doc = parsePlCatalog("ports.pl", pl);
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
    });

    it("parses type variables with Prolog constraints", () => {
      const pl = `
        catalog(type_params, 'TypeParams').
        block(b_poly, 'Poly', none, [ns(test), var('T', extends(rec(v('T'))))]).
      `;
      const doc = parsePlCatalog("poly.pl", pl);
      const typeVar = doc.blocks[0].vars[0];
      expect(typeVar.name).toBe("T");
      expect(typeVar.constraint).toBe("extends(rec(T))");
    });
  });

  describe("direct type intersection inference", () => {
    it("infers intersection of distinct types in canonical order", () => {
      const ab = inferIntersection([t("double"), t("int")]);
      expect(ab.kind).toBe("intersection");
      expect(typeToString(ab)).toBe("double & int");

      // Canonical order regardless of input argument order
      const ba = inferIntersection([t("int"), t("double")]);
      expect(typesEqual(ab, ba)).toBe(true);
    });

    it("infers intersection of three or more types", () => {
      const abc = inferIntersection([t("string"), t("int"), t("double")]);
      expect(abc.kind).toBe("intersection");
      expect(typeToString(abc)).toBe("double & int & string");
    });

    it("deduplicates identical types in intersection (idempotence)", () => {
      const single = inferIntersection([t("int"), t("int"), t("int")]);
      expect(single.kind).toBe("type");
      expectType(single, t("int"));
    });

    it("flattens nested intersections (associativity)", () => {
      const nested1 = intersectionOf([t("int"), t("double")]);
      const nested2 = intersectionOf([t("string"), t("bool")]);
      const combined = inferIntersection([nested1, nested2]);
      expect(typeToString(combined)).toBe("bool & double & int & string");
    });

    it("eliminates holes in intersections when concrete types are present", () => {
      const withHole = inferIntersection([t("int"), unbounded()]);
      expectType(withHole, t("int"));

      const multipleWithHole = inferIntersection([t("double"), unbounded(), t("string")]);
      expect(typeToString(multipleWithHole)).toBe("double & string");
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
      const c1 = consumerType(t("double"));
      const c2 = consumerType(t("int"));
      const inter = inferIntersection([c1, c2]);
      expect(inter.kind).toBe("intersection");
      expect(typeToString(inter)).toBe("(double) -> unit & (int) -> unit");
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
      cat.addPl(
        "shapes.pl",
        `
          catalog(shapes, 'Shapes').
          type('shapes.Shape', none).
          type('shapes.Polygon', none).
          parent('shapes.Polygon', 'shapes.Shape').
          type('shapes.Triangle', none).
          parent('shapes.Triangle', 'shapes.Polygon').
        `,
      );
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
      const str = t("string");
      const simplified = simplifyIntersection([shape, str], cat);
      expect(simplified.kind).toBe("intersection");
      expect(typeToString(simplified)).toBe("shapes.Shape & string");
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
    it("infers generic parameter T as intersection when grounded by two inputs", async () => {
      const cat = new Catalog();
      cat.addPl(
        "merge.pl",
        `
          catalog(b_test, 'Test').
          block(b_merge, 'Merge', none, [ns(test), var('T', none)]).
          input(b_merge, in1, in1, v('T'), []).
          input(b_merge, in2, in2, v('T'), []).
          output(b_merge, out, out, v('T'), []).
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_merge",
        new Map([
          ["in1", { kind: "single", ty: t("double") }],
          ["in2", { kind: "single", ty: t("int") }],
        ]),
      );
      expectType(resolved.params.get("T"), intersectionOf([t("double"), t("int")]));
      expectType(resolvedOutput(resolved, "out"), intersectionOf([t("double"), t("int")]));
      expect(resolved.compatible.get("in1")).toBe(true);
      expect(resolved.compatible.get("in2")).toBe(true);
    });

    it("infers generic parameter T as intersection across three inputs", async () => {
      const cat = new Catalog();
      cat.addPl(
        "merge3.pl",
        `
          catalog(b_test, 'Test').
          block(b_merge3, 'Merge3', none, [ns(test), var('T', none)]).
          input(b_merge3, in1, in1, v('T'), []).
          input(b_merge3, in2, in2, v('T'), []).
          input(b_merge3, in3, in3, v('T'), []).
          output(b_merge3, out, out, v('T'), []).
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_merge3",
        new Map([
          ["in1", { kind: "single", ty: t("double") }],
          ["in2", { kind: "single", ty: t("int") }],
          ["in3", { kind: "single", ty: t("string") }],
        ]),
      );
      expectType(resolved.params.get("T"), intersectionOf([t("double"), t("int"), t("string")]));
      expectType(resolvedOutput(resolved, "out"), intersectionOf([t("double"), t("int"), t("string")]));
    });

    it("simplifies intersection when inputs have a subtyping relation", async () => {
      const cat = new Catalog();
      cat.addPl(
        "subtypes.pl",
        `
          catalog(sub_mod, 'SubMod').
          type('sub.Base', none).
          type('sub.Derived', none).
          parent('sub.Derived', 'sub.Base').
          block(b_sub_merge, 'SubMerge', none, [ns(sub), var('T', none)]).
          input(b_sub_merge, in1, in1, v('T'), []).
          input(b_sub_merge, in2, in2, v('T'), []).
          output(b_sub_merge, out, out, v('T'), []).
        `,
      );
      const resolved = await resolveBlock(
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

    it("meets shared type variables across two inputs", async () => {
      const cat = new Catalog();
      cat.addPl(
        "opt.pl",
        `
          catalog(opt, 'Opt').
          block(b_opt, 'Opt', none, [ns(test), var('T', none)]).
          input(b_opt, in1, in1, v('T'), []).
          input(b_opt, in2, in2, v('T'), []).
          output(b_opt, out, out, v('T'), []).
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_opt",
        new Map([
          ["in1", { kind: "single", ty: t("double") }],
          ["in2", { kind: "single", ty: t("int") }],
        ]),
      );
      expectType(resolved.params.get("T"), intersectionOf([t("double"), t("int")]));
    });

    it("joins vararg groundings by default", async () => {
      const cat = new Catalog();
      cat.addPl(
        "param_rel.pl",
        `
          catalog(pr, 'PR').
          block(b_inter_varargs, 'InterVarargs', none, [ns(test), var('T', none)]).
          input(b_inter_varargs, elems, elems, v('T'), [vararg]).
          output(b_inter_varargs, result, result, array(v('T')), []).
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_inter_varargs",
        new Map([["elems", { kind: "varargs", items: [t("double"), t("int")] }]]),
      );
      expectType(
        resolvedOutput(resolved, "result"),
        arrayOf(unionOf([t("double"), t("int")])),
      );
    });
  });

  describe("explicit relations between input and output types", () => {
    it("infers output type as intersection of shared type-variable inputs", async () => {
      const cat = new Catalog();
      cat.addPl(
        "rel_block.pl",
        `
          catalog(rb, 'RB').
          block(b_rel_inter, 'RelInter', none, [ns(test), var('T', none)]).
          input(b_rel_inter, a, a, v('T'), []).
          input(b_rel_inter, b, b, v('T'), []).
          output(b_rel_inter, out, out, v('T'), []).
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_rel_inter",
        new Map([
          ["a", { kind: "single", ty: t("double") }],
          ["b", { kind: "single", ty: t("int") }],
        ]),
      );
      expectType(resolvedOutput(resolved, "out"), intersectionOf([t("double"), t("int")]));
    });

    it("infers output type as union of vararg groundings", async () => {
      const cat = new Catalog();
      cat.addPl(
        "rel_union.pl",
        `
          catalog(ru, 'RU').
          block(b_rel_union, 'RelUnion', none, [ns(test), var('T', none)]).
          input(b_rel_union, elems, elems, v('T'), [vararg]).
          output(b_rel_union, out, out, v('T'), []).
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_rel_union",
        new Map([["elems", { kind: "varargs", items: [t("float"), t("double")] }]]),
      );
      expectType(resolvedOutput(resolved, "out"), unionOf([t("double"), t("float")]));
    });

    it("infers output type via shared type variables", async () => {
      const cat = new Catalog();
      cat.addPl(
        "port_rel.pl",
        `
          catalog(pr2, 'PR2').
          block(b_port_rel, 'PortRel', none, [ns(test), var('T', none)]).
          input(b_port_rel, inA, inA, v('T'), []).
          input(b_port_rel, inB, inB, v('T'), []).
          output(b_port_rel, res, res, v('T'), []).
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_port_rel",
        new Map([
          ["inA", { kind: "single", ty: t("string") }],
          ["inB", { kind: "single", ty: t("int") }],
        ]),
      );
      expectType(resolvedOutput(resolved, "res"), intersectionOf([t("int"), t("string")]));
    });

    it("infers output type via identity of a shared type variable", async () => {
      const cat = new Catalog();
      cat.addPl(
        "id_rel.pl",
        `
          catalog(idr, 'IDR').
          block(b_ident_rel, 'IdentRel', none, [ns(test), var('T', none)]).
          input(b_ident_rel, source, source, v('T'), []).
          output(b_ident_rel, dest, dest, v('T'), []).
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_ident_rel",
        new Map([["source", { kind: "single", ty: arrayOf(t("int")) }]]),
      );
      expectType(resolvedOutput(resolved, "dest"), arrayOf(t("int")));
    });
  });

  describe("compatibility and propagation of inferred intersection types", () => {
    it("inferred intersection type is compatible with inputs expecting member types", () => {
      const cat = catalog();
      const inter = intersectionOf([t("double"), t("int")]);

      // A & B satisfies formal A
      expect(isCompatible(cat, [], t("double"), inter)).toBe(true);
      // A & B satisfies formal B
      expect(isCompatible(cat, [], t("int"), inter)).toBe(true);
      // A & B satisfies formal A & B
      expect(isCompatible(cat, [], inter, inter)).toBe(true);
      // A does not satisfy formal A & B
      expect(isCompatible(cat, [], inter, t("double"))).toBe(false);
      expect(isCompatible(cat, [], inter, t("int"))).toBe(false);
      // Independent type C is incompatible
      expect(isCompatible(cat, [], t("string"), inter)).toBe(false);
    });

    it("wires inferred intersection into downstream blocks in a diagram", async () => {
      const sysPl = `
        catalog(sys, 'Sys').
        type(double, none).
        type(int, none).
        type(string, none).
        block(source_double, 'SourceDouble', none, [ns(sys)]).
        output(source_double, val, val, double, []).
        block(source_int, 'SourceInt', none, [ns(sys)]).
        output(source_int, val, val, int, []).
        block(combiner, 'Combiner', none, [ns(sys), var('T', none)]).
        input(combiner, in1, in1, v('T'), []).
        input(combiner, in2, in2, v('T'), []).
        output(combiner, out, out, v('T'), []).
        block(sink_double, 'SinkDouble', none, [ns(sys)]).
        input(sink_double, in, in, double, []).
        block(sink_int, 'SinkInt', none, [ns(sys)]).
        input(sink_int, in, in, int, []).
      `;
      const cat = new Catalog();
      cat.addPl("system.pl", sysPl);

      const diagram = new Diagram("d_sys", "SysDiagram");
      diagram.associateXml("system.pl", sysPl);


      const dId = diagram.addNode("source_double");
      const iId = diagram.addNode("source_int");
      const cId = diagram.addNode("combiner");
      const sinkDId = diagram.addNode("sink_double");
      const sinkIId = diagram.addNode("sink_int");

      diagram.addLink(dId, "val", cId, "in1");
      diagram.addLink(iId, "val", cId, "in2");
      diagram.addLink(cId, "out", sinkDId, "in");
      diagram.addLink(cId, "out", sinkIId, "in");

      const resolvedCombiner = (await diagram.resolveNode(cId))!;
      const expectedInter = intersectionOf([t("double"), t("int")]);
      expectType(resolvedOutput(resolvedCombiner, "out"), expectedInter);

      const resolvedSinkD = (await diagram.resolveNode(sinkDId))!;
      expect(resolvedSinkD.compatible.get("in")).toBe(true);

      const resolvedSinkI = (await diagram.resolveNode(sinkIId))!;
      expect(resolvedSinkI.compatible.get("in")).toBe(true);
    });
  });
});

