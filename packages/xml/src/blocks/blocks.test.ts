import { describe, expect, it } from "vitest";
import {
  type TypeExpr,
  arrayOf,
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
} from "./ast";
import { parseMoonbitType } from "./moonbit-type";
import {
  CONTROL_SYSTEMS_XML,
  FIXTURES_XML,
  TYPES_XML,
  associateBuiltinModels,
  associateFixtureModels,
  xmlSourcesForFiles,
} from "./builtin";
import { Catalog } from "./catalog";
import { isCompatible } from "./compat";
import {
  DEFAULT_PERIOD_MS,
  SampleBuf,
  compileTimer,
  CosTransformer,
  fork,
  mapOnce,
  planGenerator,
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
import { parseBlocks } from "./parse";
import { type Grounding, TypeResolver, resolvedInput, resolvedOutput } from "./resolve";

function t(name: string): TypeExpr {
  return named(name);
}

function g(name: string, args: TypeExpr[]): TypeExpr {
  return generic(name, args);
}

function ty(src: string): TypeExpr {
  return parseMoonbitType(src);
}

function catalog(): Catalog {
  const next = new Catalog();
  next.addXml("types.xml", TYPES_XML);
  next.addXml("fixtures.xml", FIXTURES_XML);
  next.addXml("control-systems.xml", CONTROL_SYSTEMS_XML);
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
  it("rejects catalog library elements", () => {
    const xml = `
      <blocks id="t" name="T">
        <library id="lib" name="Lib"/>
      </blocks>
    `;
    expect(() => parseBlocks("t.xml", xml)).toThrow(/unsupported <blocks> child <library>/);
  });

  it("parses catalogs that declare blocks.xsd", () => {
    const xml = `
      <blocks id="t" name="T" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:noNamespaceSchemaLocation="blocks.xsd">
        <namespace id="n" name="N"/>
      </blocks>
    `;
    expect(parseBlocks("t.xml", xml).id).toBe("t");
  });

  it("builtin catalogs declare blocks.xsd", () => {
    for (const xml of [TYPES_XML, CONTROL_SYSTEMS_XML]) {
      expect(xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
      expect(xml).toContain('xsi:noNamespaceSchemaLocation="blocks.xsd"');
    }
  });

  it("parses blocks.md apply example", () => {
    const xml = `
      <blocks id="workspace_01" name="Signal Processing" icon="workspace.png">
        <namespace id="types" name="Types" icon="box.png"/>
        <block id="b_apply" name="Apply" ns="types" icon="func.png">
          <param name="T"/>
          <param name="R"/>
          <factory id="apply"/>
          <in name="fn" type="(T) -> R"/>
          <in name="arg" type="T"/>
          <out name="result" type="R"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("apply.xml", xml);
    expect(doc.id).toBe("workspace_01");
    const block = doc.blocks[0];
    expect(block.params.length).toBe(2);
    expectType(block.inputs[0].ty, funcType([t("T")], t("R")));
    expectType(block.inputs[1].ty, t("T"));
    expectType(block.outputs[0].ty, t("R"));
  });

  it("parses MoonBit holes and arrays", () => {
    const xml = `
      <blocks id="w" name="Holes">
        <block id="b" name="W" ns="test">
          <in name="ints" type="Array[Int]"/>
          <in name="consumer" type="(Double) -> Unit"/>
          <in name="unboundedInput" type="Array[_]"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("wild.xml", xml);
    const block = doc.blocks[0];
    expectType(block.inputs[0].ty, arrayOf(t("Int")));
    expectType(block.inputs[1].ty, consumerType(t("Double")));
    expectType(block.inputs[2].ty, arrayOf(unbounded()));
  });

  it("parses union intersection and Self", () => {
    const xml = `
      <blocks id="u" name="U">
        <block id="b_path" name="path" ns="example.Builder">
          <in name="segment" type="String"/>
          <in name="complexPayload" type="((T) -> Unit) &amp; (() -> T)"/>
          <out name="result" type="Int | Int64"/>
          <out name="this" type="Self"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("u.xml", xml);
    const block = doc.blocks[0];
    expectType(block.outputs[0].ty, unionOf([t("Int"), t("Int64")]));
    expect(block.outputs[1].ty.kind).toBe("self");
    expect(block.inputs[1].ty.kind).toBe("intersection");
  });

  it("parses f-bounded Rec param", () => {
    const xml = `
      <blocks id="e" name="E">
        <block id="b_rec_new" name="rec.new" ns="example">
          <param name="T">
            <extends type="Rec[T]"/>
          </param>
          <in name="cls" type="(T) -> Unit"/>
          <out name="value" type="T"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("e.xml", xml);
    expectType(doc.blocks[0].params[0].extends[0], g("Rec", [t("T")]));
  });

  it("builtin models merge", () => {
    const cat = new Catalog();
    cat.addXml("types.xml", TYPES_XML);
    cat.addXml("control-systems.xml", CONTROL_SYSTEMS_XML);
    expect(cat.block("timer")).toBeDefined();
    expect(cat.block("sin")).toBeDefined();
    expect(cat.block("cos")).toBeDefined();
    expect(cat.block("random")).toBeDefined();
    expect(cat.block("scope")).toBeDefined();
    expect(cat.block("gpio_in")).toBeDefined();
    expect(cat.block("gpio_out")).toBeDefined();
    expect(cat.block("quantizer")).toBeUndefined();
    expect(cat.block("b_array_of")).toBeUndefined();
    expect(cat.block("b_start")).toBeUndefined();
    expect(cat.blocks().map((block) => block.id).sort()).toEqual([
      "cos",
      "gpio_in",
      "gpio_out",
      "random",
      "scope",
      "sin",
      "timer",
    ]);
    expect(cat.findType("Double")).toBeDefined();
    expect(cat.findType("Array")).toBeDefined();
    expect(cat.findType("String")).toBeDefined();
    expect(cat.findType("Bool")).toBeDefined();
    expect(cat.findType("Unit")).toBeDefined();
    expect(cat.findType("Int")).toBeDefined();
    expect(cat.findType("c1")).toBeUndefined();
    expect(cat.findType("f64")).toBeUndefined();
    expect(cat.sources().length).toBe(2);
    expect(cat.catalogs().map((item) => [item.file, item.name])).toEqual([
      ["types.xml", "Types"],
      ["control-systems.xml", "Control Systems"],
    ]);
  });

  it("looks up builtin catalogs by file name", () => {
    expect(xmlSourcesForFiles(["types.xml"]).map((source) => source.name)).toEqual(["types.xml"]);
    expect(() => xmlSourcesForFiles(["missing.xml"])).toThrow("unknown catalog");
    expect(() => xmlSourcesForFiles(["models/types.xml"])).toThrow("unknown catalog");
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

  it("parses Array[T] MoonBit notation", () => {
    const xml = `
      <blocks id="a" name="A">
        <block id="b" name="B" ns="test">
          <in name="sugar" type="Array[Double]"/>
          <in name="nested" type="Array[Array[Int]]"/>
          <out name="alias" type="Array[String]"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("arr.xml", xml);
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
    cat.addXml(
      "f2.xml",
      `
        <blocks id="fn" name="Fn">
          <block id="b_apply_f2" name="apply2" ns="test">
            <param name="T1"/>
            <param name="T2"/>
            <param name="R"/>
            <in name="fn" type="(T1, T2) -> R"/>
            <in name="a" type="T1"/>
            <in name="b" type="T2"/>
            <out name="result" type="R"/>
          </block>
        </blocks>
      `,
    );
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
    cat.addXml(
      "color.xml",
      `
        <blocks id="example" name="Example">
          <type name="Rec" ns="example">
            <param name="E">
              <extends type="Rec[E]"/>
            </param>
          </type>
          <type name="Color" ns="example">
            <ancestor type="Rec[Color]"/>
          </type>
          <block id="b_color_fn" name="Color.fn" ns="example">
            <out name="value" type="(Color) -> Unit"/>
          </block>
          <block id="b_rec_new" name="rec.new" ns="example">
            <param name="T">
              <extends type="Rec[T]"/>
            </param>
            <in name="cls" type="(T) -> Unit"/>
            <out name="value" type="T"/>
          </block>
        </blocks>
      `,
    );
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
    cat.addXml(
      "need.xml",
      `
        <blocks id="b" name="B">
          <block id="need_c1" name="Need" ns="test">
            <param name="N">
              <extends type="(Double) -> Unit"/>
            </param>
            <in name="in" type="N"/>
            <out name="out" type="N"/>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(cat, "need_c1", new Map([["in", { kind: "single", ty: t("Int") }]]));
    expect(resolved.compatible.get("in")).toBe(false);
  });

  it("builder Self type is namespace", () => {
    const cat = new Catalog();
    cat.addXml(
      "mod.xml",
      `
        <blocks id="mod" name="Module">
          <block id="b_path" name="path" ns="example.Builder">
            <factory id="Builder#path"/>
            <in name="segment" type="String"/>
            <out name="this" type="Self"/>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(cat, "b_path", new Map([["segment", { kind: "single", ty: t("String") }]]));
    expectType(resolvedOutput(resolved, "this"), t("example.Builder"));
  });

  it("diagram associates multiple xml files and grounds inputs", () => {
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

  it("dissociate xml rebuilds catalog", () => {
    const diagram = new Diagram("d3", "Drop");
    associateFixtureModels(diagram);
    diagram.addNode("b_array_of");
    diagram.dissociateXml("fixtures.xml");
    expect(diagram.catalog().block("b_array_of")).toBeUndefined();
    expect(diagram.catalog().block("timer")).toBeDefined();
    expect(diagram.nodes().length).toBe(0);
    expect(diagram.catalog().catalogs().map((item) => item.name)).toEqual(["Types", "Control Systems"]);
  });

  it("hole display", () => {
    expect(displayType(unbounded(), true)).toBe("_");
    expect(ty("_").kind).toBe("hole");
  });

  it("substitutes params, replaces Self, and flattens unions", () => {
    const substituted = consumerType(t("T")).subst(new Map([["T", t("Double")]]));
    expect(displayType(substituted, true)).toBe("(Double) -> Unit");
    expect(displayType(new SelfType().replaceSelf(t("Int")), true)).toBe("Int");
    expect(typesEqual(unionOf([t("Int"), t("Int")]), t("Int"))).toBe(true);
    expect(consumerType(t("Double")).isConsumer()).toBe(true);
    expect(arrayOf(consumerType(t("Double"))).isPush()).toBe(true);
  });

  it("displays common MoonBit types", () => {
    expect(displayType(consumerType(t("Double")), true)).toBe("(Double) -> Unit");
    expect(displayType(consumerType(consumerType(t("Double"))), true)).toBe("((Double) -> Unit) -> Unit");
    expect(displayType(consumerType(consumerType(consumerType(t("Double")))), true)).toBe(
      "(((Double) -> Unit) -> Unit) -> Unit",
    );
    expect(typeToString(consumerType(consumerType(consumerType(t("Double")))))).toBe(
      "(((Double) -> Unit) -> Unit) -> Unit",
    );
    expect(displayType(funcType([t("Int")], t("String")), true)).toBe("(Int) -> String");
    expect(displayType(funcType([t("Int"), t("Int64")], t("Bool")), true)).toBe("(Int, Int64) -> Bool");
    expect(displayType(funcType([], t("Double")), true)).toBe("() -> Double");
    expect(displayType(consumerType(t("String"), t("Bool")), true)).toBe("(String, Bool) -> Unit");
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
    expect(displayType(timerBlock.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(Double) -> Unit");
    expect(timerBlock.inputs.find((port) => port.name === "in")!.attributes.find((a) => a.name === "wasm")).toBeUndefined();
    expect(timerBlock.attributes.find((a) => a.name === "runnable")?.value).toBe("true");
    expect(timerBlock.attributes.find((a) => a.name === "generator")?.value).toBe("true");
    expect(cat.block("sin")!.attributes.find((a) => a.name === "generator")).toBeUndefined();
    expect(cat.block("cos")!.attributes.find((a) => a.name === "generator")).toBeUndefined();
    const scope = cat.block("scope")!;
    expect(scope.inputs.length).toBe(0);
    expect(displayType(scope.outputs.find((port) => port.name === "out")!.ty, true)).toBe("Array[(Double) -> Unit]");
    expect(scope.outputs.find((port) => port.name === "out")!.attributes.find((a) => a.name === "dynamic")?.value).toBe(
      "true",
    );
    expect(displayType(cat.block("sin")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(Double) -> Unit");
    expect(displayType(cat.block("sin")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(Double) -> Unit");
    expect(displayType(cat.block("cos")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(Double) -> Unit");
    expect(displayType(cat.block("cos")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(Double) -> Unit");
    expect(displayType(cat.block("random")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(Double) -> Unit");
    expect(timerBlock.ns).toBe("com.dauch.cs.gen");
    expect(cat.block("sin")!.ns).toBe("com.dauch.cs.tf");
    expect(cat.block("cos")!.ns).toBe("com.dauch.cs.tf");
    expect(cat.block("random")!.ns).toBe("com.dauch.cs.gen");
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
    for (const id of ["timer", "random"] as const) {
      const period = cat.block(id)!.parameters.find((param) => param.name === "period");
      expect(period?.kind).toBe("integer-range-parameter");
      expect(period?.default).toBe("10");
      expect(period?.min).toBe(1);
      expect(period?.max).toBe(1000);
    }
    expect(cat.block("sin")!.parameters).toEqual([]);
    expect(cat.block("cos")!.parameters).toEqual([]);
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
    expect(displayType(gpioIn.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(Double) -> Unit");
    expect(gpioIn.parameters.find((param) => param.name === "pin")?.default).toBe("0");
    expect(gpioIn.parameters.find((param) => param.name === "period")).toBeUndefined();
    const gpioOut = cat.block("gpio_out")!;
    expect(gpioOut.inputs.length).toBe(0);
    expect(displayType(gpioOut.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(Double) -> Unit");
    expect(gpioOut.parameters.find((param) => param.name === "pin")?.default).toBe("1");
    expect(cat.findType("Double")).toBeDefined();
    expect(cat.findType("Array")).toBeDefined();
    expect(cat.findType("Unit")).toBeDefined();
    expect(cat.findType("Int")).toBeDefined();
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
    expect(sampleOnce("timer", 3.25)).toBe(3.25);
  });

  it("cos maps samples", () => {
    const out: number[] = [];
    const mapped = (value: number) => out.push(Math.cos(value));
    mapped(0);
    mapped(Math.PI);
    expect(Math.abs(out[0] - 1)).toBeLessThan(1e-9);
    expect(Math.abs(out[1] + 1)).toBeLessThan(1e-9);
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
    expect(Math.abs(got[0])).toBeLessThan(1e-9);
    expect(Math.abs(got[1] - 1)).toBeLessThan(1e-9);
    expect(compiled.delayMs).toBe(DEFAULT_PERIOD_MS);
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
    expect(displayType(sinResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("(Double) -> Unit");
    expect(displayType(sinResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("(Double) -> Unit");

    const scopeResolved = diagram.resolveNode(scopeId)!;
    expect(displayType(scopeResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("Array[(Double) -> Unit]");
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
    expect(displayType(resolvedOutput(scope, "out")!, true)).toBe("(Double) -> Unit");
    expect(displayType(resolvedOutput(scope, "out[1]")!, true)).toBe("(Double) -> Unit");
    expect(isPushType(resolvedOutput(scope, "out"))).toBe(true);
    expect(isPushType(resolvedOutput(scope, "out[1]"))).toBe(true);
    expect(diagram.resolveNode(sinId)!.compatible.get("in") ?? true).toBe(true);
    expect(diagram.resolveNode(cosId)!.compatible.get("in") ?? true).toBe(true);
    expect(displayType(resolvedInput(diagram.resolveNode(sinId)!, "in")!, true)).toBe("(Double) -> Unit");
    expect(displayType(resolvedOutput(diagram.resolveNode(sinId)!, "out")!, true)).toBe("(Double) -> Unit");
    expect(displayType(resolvedInput(diagram.resolveNode(cosId)!, "in")!, true)).toBe("(Double) -> Unit");
    expect(displayType(resolvedOutput(diagram.resolveNode(cosId)!, "out")!, true)).toBe("(Double) -> Unit");
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
    expect(buffers.get(0)!.snapshot()).toEqual([3]);
    expect(buffers.get(1)!.snapshot()).toEqual([3]);
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
    expect(Math.abs(buffers.get(0)!.snapshot()[0])).toBeLessThan(1e-9);
    expect(Math.abs(buffers.get(1)!.snapshot()[0] - 1)).toBeLessThan(1e-9);
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
    expect(buf.snapshot().length).toBeGreaterThan(0);
    buf.clear();
    expect(buf.snapshot().length).toBe(0);
  });

});
