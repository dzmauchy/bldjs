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
import { parseType } from "./type-parser";
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
import { parseBlocks } from "./parse";
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

function ty(src: string): TypeExpr {
  return parseType(src);
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

  it("builtin catalogs declare schemas", () => {
    expect(TYPES_XML).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    expect(TYPES_XML).toContain('xsi:noNamespaceSchemaLocation="types.xsd"');
    expect(CONTROL_SYSTEMS_XML).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    expect(CONTROL_SYSTEMS_XML).toContain('xsi:noNamespaceSchemaLocation="blocks.xsd"');
  });

  it("fixture catalog schema location resolves to blocks.xsd", () => {
    expect(FIXTURES_XML).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    expect(FIXTURES_XML).toContain('xsi:noNamespaceSchemaLocation="../resources/models/blocks.xsd"');
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
          <in name="consumer" type="(Double) -> void"/>
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

  describe("XML settings and parameter representation", () => {
    it("parses block with <settings> container and typed <setting> elements", () => {
      const xml = `
        <blocks id="cfg" name="Config">
          <block id="b_cfg" name="ConfigBlock" ns="test">
            <settings>
              <setting name="bufferSize" type="Int" default="1024" min="64" max="65536" step="64"/>
              <setting name="threshold" type="Double" default="0.75" min="0" max="1" step="0.05"/>
              <setting name="mode" type="String" default="fast" pattern="[a-z]+"/>
            </settings>
          </block>
        </blocks>
      `;
      const doc = parseBlocks("cfg.xml", xml);
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
      const xml = `
        <blocks id="p" name="Params">
          <block id="b_proc" name="Proc" ns="test">
            <parameters>
              <integer-parameter name="retries" type="Int" default="3"/>
              <double-range-parameter name="ratio" type="Double" min="0.1" max="5.0" step="0.1" default="1.0"/>
              <parameter name="customFlag" type="Bool" default="true"/>
            </parameters>
          </block>
        </blocks>
      `;
      const doc = parseBlocks("p.xml", xml);
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

  describe("XML ports, variance, and relation representation", () => {
    it("parses input/output aliases and port direction/relations", () => {
      const xml = `
        <blocks id="ports_test" name="Ports">
          <block id="b_rel_port" name="RelPort" ns="test">
            <input name="in1" type="Double" icon="pin"/>
            <input name="in2" type="Int"/>
            <output name="out1" type="Double" icon="out_pin" relation="intersection" relatesTo="in1,in2"/>
          </block>
        </blocks>
      `;
      const doc = parseBlocks("ports.xml", xml);
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
      const xml = `
        <blocks id="type_params" name="TypeParams">
          <block id="b_poly" name="Poly" ns="test">
            <param name="T" variance="+" relation="intersection">
              <extends type="Rec[T]"/>
              <super type="Int"/>
            </param>
          </block>
        </blocks>
      `;
      const doc = parseBlocks("poly.xml", xml);
      const param = doc.blocks[0].params[0];
      expect(param.name).toBe("T");
      expect(param.variance).toBe("+");
      expect(param.relation).toBe("intersection");
      expect(param.extends).toHaveLength(1);
      expect(param.super).toHaveLength(1);
      expectType(param.super![0], t("Int"));
    });

    it("parses <relation> and <type-relation> elements in blocks", () => {
      const xml = `
        <blocks id="rel_doc" name="RelDoc">
          <block id="b_intersect_block" name="IntersectBlock" ns="test">
            <in name="inA" type="Double"/>
            <in name="inB" type="Int"/>
            <out name="res" type="Unit"/>
            <relation kind="intersection" from="inA,inB" to="res"/>
            <type-relation kind="union" input="inA,inB" output="res2"/>
          </block>
        </blocks>
      `;
      const doc = parseBlocks("rel.xml", xml);
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
      cat.addXml(
        "shapes.xml",
        `
          <blocks id="shapes" name="Shapes">
            <type name="Shape" ns="shapes"/>
            <type name="Polygon" ns="shapes">
              <ancestor type="shapes.Shape"/>
            </type>
            <type name="Triangle" ns="shapes">
              <ancestor type="shapes.Polygon"/>
            </type>
          </blocks>
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
      cat.addXml(
        "merge.xml",
        `
          <blocks id="b_test" name="Test">
            <block id="b_merge" name="Merge" ns="test">
              <param name="T"/>
              <in name="in1" type="T"/>
              <in name="in2" type="T"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
        `,
      );
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
      cat.addXml(
        "merge3.xml",
        `
          <blocks id="b_test" name="Test">
            <block id="b_merge3" name="Merge3" ns="test">
              <param name="T"/>
              <in name="in1" type="T"/>
              <in name="in2" type="T"/>
              <in name="in3" type="T"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
        `,
      );
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
      cat.addXml(
        "subtypes.xml",
        `
          <blocks id="sub_mod" name="SubMod">
            <type name="Base" ns="sub"/>
            <type name="Derived" ns="sub">
              <ancestor type="sub.Base"/>
            </type>
            <block id="b_sub_merge" name="SubMerge" ns="sub">
              <param name="T"/>
              <in name="in1" type="T"/>
              <in name="in2" type="T"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
        `,
      );
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
      cat.addXml(
        "opt.xml",
        `
          <blocks id="opt" name="Opt">
            <block id="b_opt" name="Opt" ns="test">
              <param name="T"/>
              <in name="in1" type="T"/>
              <in name="in2" type="T"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
        `,
      );
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
      cat.addXml(
        "param_rel.xml",
        `
          <blocks id="pr" name="PR">
            <block id="b_inter_varargs" name="InterVarargs" ns="test">
              <param name="T" relation="intersection"/>
              <in name="elems" type="T" vararg="true"/>
              <out name="result" type="Array[T]"/>
            </block>
          </blocks>
        `,
      );
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
    it("infers output type as intersection via <relation kind='intersection'>", () => {
      const cat = new Catalog();
      cat.addXml(
        "rel_block.xml",
        `
          <blocks id="rb" name="RB">
            <block id="b_rel_inter" name="RelInter" ns="test">
              <in name="a" type="Double"/>
              <in name="b" type="Int"/>
              <out name="out" type="_"/>
              <relation kind="intersection" from="a,b" to="out"/>
            </block>
          </blocks>
        `,
      );
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

    it("infers output type as union via <relation kind='union'>", () => {
      const cat = new Catalog();
      cat.addXml(
        "rel_union.xml",
        `
          <blocks id="ru" name="RU">
            <block id="b_rel_union" name="RelUnion" ns="test">
              <in name="x" type="Float"/>
              <in name="y" type="Double"/>
              <out name="out" type="_"/>
              <relation kind="union" from="x,y" to="out"/>
            </block>
          </blocks>
        `,
      );
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
      cat.addXml(
        "port_rel.xml",
        `
          <blocks id="pr2" name="PR2">
            <block id="b_port_rel" name="PortRel" ns="test">
              <in name="inA" type="String"/>
              <in name="inB" type="Int"/>
              <out name="res" type="_" relation="intersection" relatesTo="inA,inB"/>
            </block>
          </blocks>
        `,
      );
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
      cat.addXml(
        "id_rel.xml",
        `
          <blocks id="idr" name="IDR">
            <block id="b_ident_rel" name="IdentRel" ns="test">
              <in name="source" type="Array[Int]"/>
              <out name="dest" type="_"/>
              <relation kind="identity" from="source" to="dest"/>
            </block>
          </blocks>
        `,
      );
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
      const sysXml = `
        <blocks id="sys" name="Sys">
          <type name="Double"/>
          <type name="Int"/>
          <type name="String"/>

          <block id="source_double" name="SourceDouble" ns="sys">
            <out name="val" type="Double"/>
          </block>

          <block id="source_int" name="SourceInt" ns="sys">
            <out name="val" type="Int"/>
          </block>

          <block id="combiner" name="Combiner" ns="sys">
            <param name="T"/>
            <in name="in1" type="T"/>
            <in name="in2" type="T"/>
            <out name="out" type="T"/>
          </block>

          <block id="sink_double" name="SinkDouble" ns="sys">
            <in name="in" type="Double"/>
          </block>

          <block id="sink_int" name="SinkInt" ns="sys">
            <in name="in" type="Int"/>
          </block>
        </blocks>
      `;
      const cat = new Catalog();
      cat.addXml("system.xml", sysXml);

      const diagram = new Diagram("d_sys", "SysDiagram");
      diagram.associateXml("system.xml", sysXml);


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

  describe("types.xsd, blocks.xsd, parameterized types with constraints, and wildcard variance", () => {
    it("types.xml defines primitive types, standard types, Array, and function types like c1<T>", () => {
      const cat = new Catalog();
      cat.addXml("types.xml", TYPES_XML);

      const c1Def = cat.findType("c1");
      expect(c1Def).toBeDefined();
      expect(c1Def!.vars.length).toBe(1);
      expect(c1Def!.vars[0]!.name).toBe("T");
      expect(c1Def!.alias).toBeDefined();

      const c1Expanded = cat.expandAlias(generic("c1", [t("f64")]));
      expect(c1Expanded).toBeDefined();
      expectType(c1Expanded!, funcType([t("f64")], t("void")));

      // c1 is a consumer type and push wire type
      expect(isConsumerType(named("c1"))).toBe(true);
      expect(isConsumerType(generic("c1", [t("f64")]))).toBe(true);
      expect(isPushType(generic("c1", [t("f64")]))).toBe(true);
      expect(isPushType(arrayOf(generic("c1", [t("f64")])))).toBe(true);
    });

    it("parseType parses angle brackets and wildcard types", () => {
      const t1 = ty("c1<f64>");
      expect(t1.kind).toBe("type");
      expect((t1 as any).name).toBe("c1");
      expect((t1 as any).args.length).toBe(1);
      expectType((t1 as any).args[0], t("f64"));

      const tWildExtends = ty("Animal<? extends Genotype>");
      expect(tWildExtends.kind).toBe("type");
      const arg1 = (tWildExtends as any).args[0];
      expect(arg1.kind).toBe("wildcard");
      expect(arg1.boundKind).toBe("extends");
      expectType(arg1.bound, t("Genotype"));
      expect(arg1.display(true)).toBe("? extends Genotype");

      const tWildSuper = ty("Animal<? super Cat>");
      expect(tWildSuper.kind).toBe("type");
      const arg2 = (tWildSuper as any).args[0];
      expect(arg2.kind).toBe("wildcard");
      expect(arg2.boundKind).toBe("super");
      expectType(arg2.bound, t("Cat"));
      expect(arg2.display(true)).toBe("? super Cat");

      const tWildUnbounded = ty("Animal<?>");
      expect(tWildUnbounded.kind).toBe("type");
      const arg3 = (tWildUnbounded as any).args[0];
      expect(arg3.kind).toBe("wildcard");
      expect(arg3.boundKind).toBeNull();
      expect(arg3.bound).toBeNull();
      expect(arg3.display(true)).toBe("?");

      const tNested = ty("Box<Box<T>>");
      expect(tNested.kind).toBe("type");
      expect((tNested as any).args[0].kind).toBe("type");
      expect((tNested as any).args[0].name).toBe("Box");

      const tInter = ty("Box<Reader & Writer>");
      expect(tInter.kind).toBe("type");
      expect((tInter as any).args[0].kind).toBe("intersection");
    });

    it("types can have type parameters and constraints without variance: Animal<X extends Genotype>, Cat<X extends Genotype> extends Animal<X>", () => {
      const cat = new Catalog();
      cat.addXml(
        "animals.xml",
        `
          <types id="animals" name="Animals" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="types.xsd">
            <type name="Genotype"/>
            <type name="CatGenotype" extends="Genotype"/>
            <type name="DogGenotype" extends="Genotype"/>

            <type name="Animal">
              <var name="X" extends="Genotype"/>
            </type>

            <type name="Cat" extends="Animal&lt;X&gt;">
              <var name="X" extends="Genotype"/>
            </type>
          </types>
        `,
      );

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
      cat.addXml(
        "wildcards.xml",
        `
          <types id="wildcards" name="Wildcards" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="types.xsd">
            <type name="Genotype"/>
            <type name="CatGenotype" extends="Genotype"/>
            <type name="PersianGenotype" extends="CatGenotype"/>

            <type name="Animal">
              <var name="X" extends="Genotype"/>
            </type>

            <type name="Cat" extends="Animal&lt;X&gt;">
              <var name="X" extends="Genotype"/>
            </type>
          </types>
        `,
      );

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

    it("block can have type variables via <var> with constraints (extends ...)", () => {
      const cat = new Catalog();
      cat.addXml(
        "block_vars.xml",
        `
          <blocks id="test_block_vars" name="TestBlockVars" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="blocks.xsd">
            <type name="Genotype"/>
            <type name="CatGenotype" extends="Genotype"/>
            <type name="String"/>

            <block id="b_process_gene" name="ProcessGene" ns="test">
              <var name="T" extends="Genotype"/>
              <in name="gene" type="T"/>
              <out name="result" type="T"/>
            </block>
          </blocks>
        `,
      );

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
      cat.addXml(
        "all_input_forms.xml",
        `
          <blocks id="input_forms" name="InputForms" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="blocks.xsd">
            <type name="Genotype"/>
            <type name="Cat" extends="Genotype"/>
            <type name="Reader"/>
            <type name="Writer"/>
            <type name="f64"/>

            <type name="Animal">
              <var name="X" extends="Genotype"/>
            </type>

            <type name="Box">
              <var name="T"/>
            </type>

            <block id="b_all_forms" name="AllForms" ns="test">
              <var name="V" extends="Genotype"/>

              <!-- 1. Block type variable -->
              <in name="p_var" type="V"/>

              <!-- 2. Raw type -->
              <in name="p_raw" type="f64"/>

              <!-- 3. Intersection type -->
              <in name="p_inter" type="Reader &amp; Writer"/>

              <!-- 4. Parameterized type with: -->
              <!-- 4a. parameterized type of this definition -->
              <in name="p_param_nested" type="Box&lt;Box&lt;V&gt;&gt;"/>

              <!-- 4b. block type variable -->
              <in name="p_param_var" type="Box&lt;V&gt;"/>

              <!-- 4c. raw type -->
              <in name="p_param_raw" type="Box&lt;f64&gt;"/>

              <!-- 4d. wildcard type with upper bound -->
              <in name="p_param_wild_upper" type="Animal&lt;? extends Genotype&gt;"/>

              <!-- 4e. wildcard type with lower bound -->
              <in name="p_param_wild_lower" type="Animal&lt;? super Cat&gt;"/>

              <!-- 4f. wildcard type unbounded -->
              <in name="p_param_wild_unbounded" type="Animal&lt;?&gt;"/>

              <!-- 4g. intersection type -->
              <in name="p_param_inter" type="Box&lt;Reader &amp; Writer&gt;"/>
            </block>
          </blocks>
        `,
      );

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

    it("inputs can also be defined via structured XML child elements", () => {
      const cat = new Catalog();
      cat.addXml(
        "structured_inputs.xml",
        `
          <blocks id="struct_inputs" name="StructInputs" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="blocks.xsd">
            <type name="Genotype"/>
            <type name="Cat" extends="Genotype"/>
            <type name="f64"/>
            <type name="Animal"><var name="X" extends="Genotype"/></type>
            <type name="Box"><var name="T"/></type>
            <type name="Reader"/>
            <type name="Writer"/>

            <block id="b_struct" name="StructBlock" ns="test">
              <var name="V" extends="Genotype"/>

              <!-- block type variable -->
              <in name="p_var"><var name="V"/></in>

              <!-- raw type -->
              <in name="p_raw"><raw-type name="f64"/></in>

              <!-- intersection type -->
              <in name="p_inter">
                <intersection>
                  <type name="Reader"/>
                  <type name="Writer"/>
                </intersection>
              </in>

              <!-- parameterized type with wildcard upper bound -->
              <in name="p_wild_upper">
                <type name="Animal">
                  <wildcard variance="+" extends="Genotype"/>
                </type>
              </in>

              <!-- parameterized type with wildcard lower bound -->
              <in name="p_wild_lower">
                <type name="Animal">
                  <wildcard variance="-" super="Cat"/>
                </type>
              </in>

              <!-- parameterized type with unbounded wildcard -->
              <in name="p_wild_unbound">
                <type name="Animal">
                  <wildcard/>
                </type>
              </in>

              <!-- parameterized type with nested parameterized type -->
              <in name="p_nested">
                <type name="Box">
                  <type name="Box">
                    <var name="V"/>
                  </type>
                </type>
              </in>
            </block>
          </blocks>
        `,
      );

      const block = cat.block("b_struct")!;
      expect(block).toBeDefined();

      expect(blockInput(block, "p_var")!.ty.equals(t("V"))).toBe(true);
      expect(blockInput(block, "p_raw")!.ty.equals(t("f64"))).toBe(true);
      expect(blockInput(block, "p_inter")!.ty.kind).toBe("intersection");

      const pWildUpper = blockInput(block, "p_wild_upper")!.ty;
      expect((pWildUpper as any).args[0].kind).toBe("wildcard");
      expect((pWildUpper as any).args[0].boundKind).toBe("extends");

      const pWildLower = blockInput(block, "p_wild_lower")!.ty;
      expect((pWildLower as any).args[0].kind).toBe("wildcard");
      expect((pWildLower as any).args[0].boundKind).toBe("super");

      const pWildUnbound = blockInput(block, "p_wild_unbound")!.ty;
      expect((pWildUnbound as any).args[0].kind).toBe("wildcard");
      expect((pWildUnbound as any).args[0].boundKind).toBeNull();
    });

    it("type resolver infers type variables through c1<T> and functions", () => {
      const cat = new Catalog();
      cat.addXml("types.xml", TYPES_XML);
      cat.addXml(
        "fn_blocks.xml",
        `
          <blocks id="fn_blocks" name="FnBlocks" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="blocks.xsd">
            <block id="b_c1_consumer" name="C1Consumer" ns="test">
              <var name="T"/>
              <in name="fn" type="c1&lt;T&gt;"/>
              <out name="echo" type="c1&lt;T&gt;"/>
            </block>
          </blocks>
        `,
      );

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
      cat.addXml(
        "wildcard_infer.xml",
        `
          <blocks id="wild_infer" name="WildcardInfer" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="blocks.xsd">
            <type name="Genotype"/>
            <type name="Cat" extends="Genotype"/>
            <type name="Animal"><var name="X" extends="Genotype"/></type>

            <block id="b_wild_block" name="WildBlock" ns="test">
              <var name="T" extends="Genotype"/>
              <in name="animal" type="Animal&lt;? extends T&gt;"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
        `,
      );

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


