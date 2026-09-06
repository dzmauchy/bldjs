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

  it("fixture catalog schema location resolves to blocks.xsd", () => {
    expect(FIXTURES_XML).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    expect(FIXTURES_XML).toContain('xsi:noNamespaceSchemaLocation="../resources/models/blocks.xsd"');
  });

  it("parses blocks.md apply example", () => {
    const xml = `
      <blocks id="workspace_01" name="Signal Processing" icon="workspace.png">
        <namespace id="types" name="Types" icon="box.png"/>
        <block id="b_apply" name="Apply" ns="types" icon="func.png">
          <var>T</var>
          <var>R</var>
          <type>true.</type>
          <in name="fn" type="(T) -> R"/>
          <in name="arg" type="T"/>
          <out name="result" type="R"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("apply.xml", xml);
    expect(doc.id).toBe("workspace_01");
    const block = doc.blocks[0];
    expect(block.vars.length).toBe(2);
    expect(block.vars.map((item) => item.name)).toEqual(["T", "R"]);
    expect(block.typeProg).toBe("true.");
    expectType(block.inputs[0].ty, funcType([t("T")], t("R")));
    expectType(block.inputs[1].ty, t("T"));
    expectType(block.outputs[0].ty, t("R"));
  });

  it("parses MoonBit holes and arrays", () => {
    const xml = `
      <blocks id="w" name="Holes">
        <block id="b" name="W" ns="test">
          <in name="ints" type="array[int]"/>
          <in name="consumer" type="(double) -> unit"/>
          <in name="unboundedInput" type="array[_]"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("wild.xml", xml);
    const block = doc.blocks[0];
    expectType(block.inputs[0].ty, arrayOf(t("int")));
    expectType(block.inputs[1].ty, consumerType(t("double")));
    expectType(block.inputs[2].ty, arrayOf(unbounded()));
  });

  it("parses union intersection and self", () => {
    const xml = `
      <blocks id="u" name="U">
        <block id="b_path" name="path" ns="example.Builder">
          <in name="segment" type="string"/>
          <in name="complexPayload" type="((T) -> unit) &amp; (() -> T)"/>
          <out name="result" type="int | int64"/>
          <out name="this" type="self"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("u.xml", xml);
    const block = doc.blocks[0];
    expectType(block.outputs[0].ty, unionOf([t("int"), t("int64")]));
    expect(block.outputs[1].ty.kind).toBe("self");
    expect(block.inputs[1].ty.kind).toBe("intersection");
  });

  it("parses f-bounded var constraints", () => {
    const xml = `
      <blocks id="e" name="E">
        <block id="b_rec_new" name="rec.new" ns="example">
          <var>T:extends(rec(T))</var>
          <type>true.</type>
          <in name="cls" type="(T) -> unit"/>
          <out name="value" type="T"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("e.xml", xml);
    expect(doc.blocks[0].vars[0].name).toBe("T");
    expect(doc.blocks[0].vars[0].constraint).toBe("extends(rec(T))");
  });

  it("rejects factory and param tags", () => {
    expect(() =>
      parseBlocks(
        "f.xml",
        `<blocks id="t" name="T"><block id="b" name="B" ns="n"><factory id="apply"/></block></blocks>`,
      ),
    ).toThrow(/factory/);
    expect(() =>
      parseBlocks(
        "p.xml",
        `<blocks id="t" name="T"><block id="b" name="B" ns="n"><param name="T"/></block></blocks>`,
      ),
    ).toThrow(/param/);
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
      ["types.xml", "Types"],
      ["control-systems.xml", "Control Systems"],
    ]);
  });

  it("looks up builtin catalogs by file name", () => {
    expect(xmlSourcesForFiles(["types.xml"]).map((source) => source.name)).toEqual(["types.xml"]);
    expect(() => xmlSourcesForFiles(["missing.xml"])).toThrow("unknown catalog");
    expect(() => xmlSourcesForFiles(["models/types.xml"])).toThrow("unknown catalog");
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
    const xml = `
      <blocks id="a" name="A">
        <block id="b" name="B" ns="test">
          <in name="sugar" type="array[double]"/>
          <in name="nested" type="array[array[int]]"/>
          <out name="alias" type="array[string]"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("arr.xml", xml);
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
    cat.addXml(
      "f2.xml",
      `
        <blocks id="fn" name="Fn">
          <block id="b_apply_f2" name="apply2" ns="test">
            <var>T1</var>
            <var>T2</var>
            <var>R</var>
            <in name="fn" type="(T1, T2) -> R"/>
            <in name="a" type="T1"/>
            <in name="b" type="T2"/>
            <out name="result" type="R"/>
          </block>
        </blocks>
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
    cat.addXml(
      "color.xml",
      `
        <blocks id="example" name="Example">
          <type name="rec" ns="example">
            <var>E:extends(rec(E))</var>
          </type>
          <type name="color" ns="example">
            <ancestor type="rec[color]"/>
          </type>
          <block id="b_color_fn" name="Color.fn" ns="example">
            <type>true.</type>
            <out name="value" type="(color) -> unit"/>
          </block>
          <block id="b_rec_new" name="rec.new" ns="example">
            <var>T:extends(rec(T))</var>
            <type>true.</type>
            <in name="cls" type="(T) -> unit"/>
            <out name="value" type="T"/>
          </block>
        </blocks>
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
    cat.addXml(
      "need.xml",
      `
        <blocks id="b" name="B">
          <block id="need_c1" name="Need" ns="test">
            <var>N:extends(fn([double], unit))</var>
            <in name="in" type="N"/>
            <out name="out" type="N"/>
          </block>
        </blocks>
      `,
    );
    const resolved = await resolveBlock(cat, "need_c1", new Map([["in", { kind: "single", ty: t("int") }]]));
    expect(resolved.compatible.get("in")).toBe(false);
  });

  it("builder self type is namespace", async () => {
    const cat = new Catalog();
    cat.addXml(
      "mod.xml",
      `
        <blocks id="mod" name="Module">
          <block id="b_path" name="path" ns="example.Builder">
            <in name="segment" type="string"/>
            <out name="this" type="self"/>
          </block>
        </blocks>
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

  describe("XML settings and parameter representation", () => {
    it("parses block with <settings> container and typed <setting> elements", () => {
      const xml = `
        <blocks id="cfg" name="Config">
          <block id="b_cfg" name="ConfigBlock" ns="test">
            <settings>
              <setting name="bufferSize" type="int" default="1024" min="64" max="65536" step="64"/>
              <setting name="threshold" type="double" default="0.75" min="0" max="1" step="0.05"/>
              <setting name="mode" type="string" default="fast" pattern="[a-z]+"/>
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
      const xml = `
        <blocks id="p" name="Params">
          <block id="b_proc" name="Proc" ns="test">
            <parameters>
              <integer-parameter name="retries" type="int" default="3"/>
              <double-range-parameter name="ratio" type="double" min="0.1" max="5.0" step="0.1" default="1.0"/>
              <parameter name="customFlag" type="bool" default="true"/>
            </parameters>
          </block>
        </blocks>
      `;
      const doc = parseBlocks("p.xml", xml);
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

  describe("XML ports, variance, and relation representation", () => {
    it("parses input/output aliases and port direction/relations", () => {
      const xml = `
        <blocks id="ports_test" name="Ports">
          <block id="b_rel_port" name="RelPort" ns="test">
            <input name="in1" type="double" icon="pin"/>
            <input name="in2" type="int"/>
            <output name="out1" type="double" icon="out_pin" relation="intersection" relatesTo="in1,in2"/>
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

    it("parses type variables with Prolog constraints", () => {
      const xml = `
        <blocks id="type_params" name="TypeParams">
          <block id="b_poly" name="Poly" ns="test">
            <var>T:extends(rec(T))</var>
            <type>true.</type>
          </block>
        </blocks>
      `;
      const doc = parseBlocks("poly.xml", xml);
      const typeVar = doc.blocks[0].vars[0];
      expect(typeVar.name).toBe("T");
      expect(typeVar.constraint).toBe("extends(rec(T))");
    });

    it("parses <relation> and <type-relation> elements in blocks", () => {
      const xml = `
        <blocks id="rel_doc" name="RelDoc">
          <block id="b_intersect_block" name="IntersectBlock" ns="test">
            <in name="inA" type="double"/>
            <in name="inB" type="int"/>
            <out name="res" type="unit"/>
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
      cat.addXml(
        "merge.xml",
        `
          <blocks id="b_test" name="Test">
            <block id="b_merge" name="Merge" ns="test">
              <var>T</var>
              <in name="in1" type="T"/>
              <in name="in2" type="T"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
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
      cat.addXml(
        "merge3.xml",
        `
          <blocks id="b_test" name="Test">
            <block id="b_merge3" name="Merge3" ns="test">
              <var>T</var>
              <in name="in1" type="T"/>
              <in name="in2" type="T"/>
              <in name="in3" type="T"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
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
      cat.addXml(
        "subtypes.xml",
        `
          <blocks id="sub_mod" name="SubMod">
            <type name="Base" ns="sub"/>
            <type name="Derived" ns="sub">
              <ancestor type="sub.Base"/>
            </type>
            <block id="b_sub_merge" name="SubMerge" ns="sub">
              <var>T</var>
              <in name="in1" type="T"/>
              <in name="in2" type="T"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
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
      cat.addXml(
        "opt.xml",
        `
          <blocks id="opt" name="Opt">
            <block id="b_opt" name="Opt" ns="test">
              <var>T</var>
              <type>true.</type>
              <in name="in1" type="T"/>
              <in name="in2" type="T"/>
              <out name="out" type="T"/>
            </block>
          </blocks>
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
      cat.addXml(
        "param_rel.xml",
        `
          <blocks id="pr" name="PR">
            <block id="b_inter_varargs" name="InterVarargs" ns="test">
              <var>T</var>
              <type>true.</type>
              <in name="elems" type="T" vararg="true"/>
              <out name="result" type="array[T]"/>
            </block>
          </blocks>
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
    it("infers output type as intersection via <relation kind='intersection'>", async () => {
      const cat = new Catalog();
      cat.addXml(
        "rel_block.xml",
        `
          <blocks id="rb" name="RB">
            <block id="b_rel_inter" name="RelInter" ns="test">
              <type>meet(In_a, In_b, Out_out).</type>
              <in name="a" type="double"/>
              <in name="b" type="int"/>
              <out name="out" type="_"/>
            </block>
          </blocks>
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

    it("infers output type as union via <relation kind='union'>", async () => {
      const cat = new Catalog();
      cat.addXml(
        "rel_union.xml",
        `
          <blocks id="ru" name="RU">
            <block id="b_rel_union" name="RelUnion" ns="test">
              <type>join(In_x, In_y, Out_out).</type>
              <in name="x" type="float"/>
              <in name="y" type="double"/>
              <out name="out" type="_"/>
            </block>
          </blocks>
        `,
      );
      const resolved = await resolveBlock(
        cat,
        "b_rel_union",
        new Map([
          ["x", { kind: "single", ty: t("float") }],
          ["y", { kind: "single", ty: t("double") }],
        ]),
      );
      expectType(resolvedOutput(resolved, "out"), unionOf([t("double"), t("float")]));
    });

    it("infers output type via port relatesTo and relation attributes", async () => {
      const cat = new Catalog();
      cat.addXml(
        "port_rel.xml",
        `
          <blocks id="pr2" name="PR2">
            <block id="b_port_rel" name="PortRel" ns="test">
              <type>meet(In_inA, In_inB, Out_res).</type>
              <in name="inA" type="string"/>
              <in name="inB" type="int"/>
              <out name="res" type="_"/>
            </block>
          </blocks>
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

    it("infers output type via identity relation", async () => {
      const cat = new Catalog();
      cat.addXml(
        "id_rel.xml",
        `
          <blocks id="idr" name="IDR">
            <block id="b_ident_rel" name="IdentRel" ns="test">
              <type>Out_dest = In_source.</type>
              <in name="source" type="array[int]"/>
              <out name="dest" type="_"/>
            </block>
          </blocks>
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
      const sysXml = `
        <blocks id="sys" name="Sys">
          <type name="double"/>
          <type name="int"/>
          <type name="string"/>

          <block id="source_double" name="SourceDouble" ns="sys">
            <out name="val" type="double"/>
          </block>

          <block id="source_int" name="SourceInt" ns="sys">
            <out name="val" type="int"/>
          </block>

          <block id="combiner" name="Combiner" ns="sys">
            <var>T</var>
            <in name="in1" type="T"/>
            <in name="in2" type="T"/>
            <out name="out" type="T"/>
          </block>

          <block id="sink_double" name="SinkDouble" ns="sys">
            <in name="in" type="double"/>
          </block>

          <block id="sink_int" name="SinkInt" ns="sys">
            <in name="in" type="int"/>
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

