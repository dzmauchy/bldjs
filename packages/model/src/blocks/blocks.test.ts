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
  FIXTURES_FILE,
  FIXTURES_TS,
  MODEL_FILE,
  MODEL_TS,
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
import {
  type Grounding,
  TypeResolver,
  resolvedInput,
  resolvedOutput,
} from "./resolve";
import { isPrimitive, PRIMITIVES } from "./types";

function t(name: string): TypeExpr {
  return named(name);
}

function catalog(): Catalog {
  const next = new Catalog();
  next.addTypeScript(MODEL_FILE, MODEL_TS);
  next.addTypeScript(FIXTURES_FILE, FIXTURES_TS);
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
  it("builtin models merge from model.ts", () => {
    const cat = new Catalog();
    cat.addTypeScript(MODEL_FILE, MODEL_TS);
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
    expect(cat.findType("f32")).toBeDefined();
    expect(cat.findType("void")).toBeDefined();
    expect(cat.sources()).toEqual([MODEL_FILE]);
    expect(cat.catalogs().map((item) => [item.file, item.name])).toEqual([[MODEL_FILE, "Control Systems"]]);
  });

  it("looks up builtin catalogs by file name", () => {
    expect(catalogSourcesForFiles([MODEL_FILE]).map((source) => source.name)).toEqual([MODEL_FILE]);
    expect(() => catalogSourcesForFiles(["missing.ts"])).toThrow("unknown catalog");
    expect(() => catalogSourcesForFiles(["models/model.ts"])).toThrow("unknown catalog");
  });

  it("typed-array aliases stay distinct by written name", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], t("f64"), t("f32"))).toBe(false);
    expect(isCompatible(cat, [], t("f32"), t("f64"))).toBe(false);
    expect(isCompatible(cat, [], t("f32"), t("f32"))).toBe(true);
    expect(isCompatible(cat, [], t("bool"), t("i32"))).toBe(false);
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

  it("diagram associates model and fixtures and grounds inputs", () => {
    const diagram = new Diagram("d1", "Demo");
    associateFixtureModels(diagram);
    expect(diagram.sources().length).toBe(2);

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
    diagram.dissociateTypeScript(FIXTURES_FILE);
    expect(diagram.catalog().block("b_array_of")).toBeUndefined();
    expect(diagram.catalog().block("timer")).toBeDefined();
    expect(diagram.nodes().length).toBe(0);
    expect(diagram.catalog().catalogs().map((item) => item.name)).toEqual(["Control Systems"]);
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

  it("displays common function and array types", () => {
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

});
