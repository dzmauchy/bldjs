import { describe, expect, it } from "vitest";
import {
  type TypeExpr,
  arrayOf,
  displayType,
  extendsBound,
  isConsumerType,
  typeToString,
  generic,
  named,
  parseVariance,
  typesEqual,
  unbounded,
} from "./ast";
import {
  CONTROL_SYSTEMS_XML,
  FIXTURES_XML,
  TYPES_XML,
  associateBuiltinModels,
  associateFixtureModels,
} from "./builtin";
import { Catalog } from "./catalog";
import { isCompatible } from "./compat";
import {
  QUANTIZER_DELAY_MS,
  SampleBuf,
  compileGenerator,
  compileTimer,
  fork,
  cos,
  generatorText,
  planGenerator,
  oscilloscope,
  quantizer,
  sin,
  sinFunc,
  spawnTimer,
  stop,
  timer,
} from "./cs";
import { type Link, Diagram } from "./diagram";
import { parseBlocks } from "./parse";
import { type Grounding, TypeResolver, resolvedOutput } from "./resolve";

function t(name: string): TypeExpr {
  return named(name);
}

function g(name: string, args: TypeExpr[]): TypeExpr {
  return generic(name, args);
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
          <factory id="f1#apply">
            <t type="T"/>
            <t type="R"/>
          </factory>
          <in name="fn" type="f1">
            <t type="T"/>
            <t type="R"/>
          </in>
          <in name="arg" type="T"/>
          <out name="result" type="R"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("apply.xml", xml);
    expect(doc.id).toBe("workspace_01");
    const block = doc.blocks[0];
    expect(block.params.length).toBe(2);
    expectType(block.inputs[0].ty, g("f1", [t("T"), t("R")]));
    expectType(block.inputs[1].ty, t("T"));
    expectType(block.outputs[0].ty, t("R"));
  });

  it("parses variance wildcards", () => {
    const xml = `
      <blocks id="w" name="Wildcards">
        <block id="b" name="W" ns="test">
          <in name="covariantInput" type="[]">
            <t type="i32" variance="+"/>
          </in>
          <in name="contravariantInput" type="c1">
            <t type="f64" variance="-"/>
          </in>
          <in name="unboundedInput" type="[]">
            <t variance="?"/>
          </in>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("wild.xml", xml);
    const block = doc.blocks[0];
    expectType(block.inputs[0].ty, arrayOf(extendsBound(t("i32"))));
    expectType(block.inputs[1].ty, g("c1", [{ kind: "wildcard", variance: "contravariant", bound: t("f64") }]));
    expectType(block.inputs[2].ty, arrayOf(unbounded()));
  });

  it("parses union intersection and self", () => {
    const xml = `
      <blocks id="u" name="U">
        <block id="b_path" name="path" ns="example.Builder">
          <in name="segment" type="str"/>
          <in name="complexPayload">
            <intersection>
              <t type="c1">
                <t type="T"/>
              </t>
              <t type="s">
                <t type="T"/>
              </t>
            </intersection>
          </in>
          <out name="result">
            <union>
              <t type="i32"/>
              <t type="i64"/>
            </union>
          </out>
          <out name="this">
            <self/>
          </out>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("u.xml", xml);
    const block = doc.blocks[0];
    expectType(block.outputs[0].ty, { kind: "union", members: [t("i32"), t("i64")] });
    expect(block.outputs[1].ty.kind).toBe("self");
    expect(block.inputs[1].ty.kind).toBe("intersection");
  });

  it("parses f-bounded rec param", () => {
    const xml = `
      <blocks id="e" name="E">
        <block id="b_rec_new" name="rec.new" ns="example">
          <param name="T">
            <extends type="rec">
              <t type="T"/>
            </extends>
          </param>
          <in name="cls" type="c1">
            <t type="T"/>
          </in>
          <out name="value" type="T"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("e.xml", xml);
    expectType(doc.blocks[0].params[0].extends[0], g("rec", [t("T")]));
  });

  it("builtin models merge", () => {
    const cat = new Catalog();
    cat.addXml("types.xml", TYPES_XML);
    cat.addXml("control-systems.xml", CONTROL_SYSTEMS_XML);
    expect(cat.block("timer")).toBeDefined();
    expect(cat.block("quantizer")).toBeDefined();
    expect(cat.block("sin")).toBeDefined();
    expect(cat.block("cos")).toBeDefined();
    expect(cat.block("oscilloscope")).toBeDefined();
    expect(cat.block("b_array_of")).toBeUndefined();
    expect(cat.block("b_start")).toBeUndefined();
    expect(cat.blocks().map((block) => block.id).sort()).toEqual([
      "cos",
      "oscilloscope",
      "quantizer",
      "sin",
      "timer",
    ]);
    expect(cat.findType("c1")).toBeDefined();
    expect(cat.findType("f64")).toBeDefined();
    expect(cat.findType("[]")).toBeDefined();
    expect(cat.findType("str")).toBeDefined();
    expect(cat.findType("bool")).toBeDefined();
    expect(cat.findType("str")?.attributes.find((attribute) => attribute.name === "wasm")?.value).toBe("js-string");
    expect(cat.findType("bool")?.attributes.find((attribute) => attribute.name === "wasm")?.value).toBe("i32");
    expect(cat.findType("c1")?.attributes.find((attribute) => attribute.name === "wasm")?.value).toBe(
      "(func (param T))",
    );
    expect(cat.sources().length).toBe(2);
  });

  it("array of f64 is compatible with array wildcard", () => {
    const cat = catalog();
    const formal = arrayOf(extendsBound(t("f64")));
    const actual = arrayOf(t("f64"));
    expect(isCompatible(cat, [], formal, actual)).toBe(true);
    const invariant = arrayOf(t("i32"));
    expect(isCompatible(cat, [], invariant, actual)).toBe(false);
  });

  it("c1 and f1 are distinct function types", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], g("c1", [t("f64")]), g("c1", [t("f64")]))).toBe(true);
    expect(isCompatible(cat, [], g("c1", [t("f64")]), g("f1", [t("f64"), t("f64")]))).toBe(false);
    expect(isCompatible(cat, [], g("s", [t("f64")]), g("c1", [t("f64")]))).toBe(false);
  });

  it("c1 contravariance", () => {
    const cat = catalog();
    const formal = g("c1", [{ kind: "wildcard", variance: "contravariant", bound: g("c1", [t("f64")]) }]);
    expect(isCompatible(cat, [], formal, g("c1", [g("s", [t("f64")])]))).toBe(false);
    expect(isCompatible(cat, [], formal, g("c1", [t("i32")]))).toBe(false);
    expect(isCompatible(cat, [], formal, g("c1", [g("c1", [t("f64")])]))).toBe(true);
  });

  it("parses T[] sugar and array as []", () => {
    const xml = `
      <blocks id="a" name="A">
        <block id="b" name="B" ns="test">
          <in name="sugar" type="f64[]"/>
          <in name="nested" type="i32[][]"/>
          <out name="alias" type="array">
            <t type="str"/>
          </out>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("arr.xml", xml);
    expectType(doc.blocks[0].inputs[0].ty, arrayOf(t("f64")));
    expectType(doc.blocks[0].inputs[1].ty, arrayOf(arrayOf(t("i32"))));
    expectType(doc.blocks[0].outputs[0].ty, arrayOf(t("str")));
  });

  it("catalog primitives do not widen and bool is not i32", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], t("i64"), t("i32"))).toBe(false);
    expect(isCompatible(cat, [], t("i32"), t("i64"))).toBe(false);
    expect(isCompatible(cat, [], t("f64"), t("f32"))).toBe(false);
    expect(isCompatible(cat, [], t("f64"), t("f64"))).toBe(true);
    expect(isCompatible(cat, [], t("bool"), t("i32"))).toBe(false);
    expect(isCompatible(cat, [], t("i32"), t("bool"))).toBe(false);
    expect(isCompatible(cat, [], t("str"), t("i32"))).toBe(false);
  });

  it("infer array of from f64 grounding", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_array_of",
      new Map([["elems", { kind: "single", ty: t("f64") }]]),
    );
    expectType(resolved.params.get("T"), t("f64"));
    expectType(resolvedOutput(resolved, "result"), arrayOf(t("f64")));
    expect(resolved.compatible.get("elems")).toBe(true);
  });

  it("infer array of vararg union", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_array_of",
      new Map([["elems", { kind: "varargs", items: [t("f64"), t("i32")] }]]),
    );
    expectType(resolvedOutput(resolved, "result"), arrayOf({ kind: "union", members: [t("f64"), t("i32")] }));
  });

  it("infer f2 from two inputs", () => {
    const cat = catalog();
    cat.addXml(
      "f2.xml",
      `
        <blocks id="fn" name="Fn">
          <block id="b_apply_f2" name="apply2" ns="test">
            <param name="T1"/>
            <param name="T2"/>
            <param name="R"/>
            <in name="fn" type="f2">
              <t type="T1"/>
              <t type="T2"/>
              <t type="R"/>
            </in>
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
        ["fn", { kind: "single", ty: g("f2", [t("i32"), t("str"), t("bool")]) }],
        ["a", { kind: "single", ty: t("i32") }],
        ["b", { kind: "single", ty: t("str") }],
      ]),
    );
    expectType(resolved.params.get("T1"), t("i32"));
    expectType(resolved.params.get("T2"), t("str"));
    expectType(resolved.params.get("R"), t("bool"));
    expectType(resolvedOutput(resolved, "result"), t("bool"));
  });

  it("unbound param grounds to wildcard", () => {
    const resolved = resolveBlock(catalog(), "b_process", new Map());
    expectType(resolvedOutput(resolved, "out"), unbounded());
  });

  it("process identity from array", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_process",
      new Map([["in", { kind: "single", ty: arrayOf(t("f64")) }]]),
    );
    expectType(resolvedOutput(resolved, "out"), arrayOf(t("f64")));
  });

  it("array get infers element type", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_array_get",
      new Map([
        ["array", { kind: "single", ty: arrayOf(t("f64")) }],
        ["index", { kind: "single", ty: t("i32") }],
      ]),
    );
    expectType(resolvedOutput(resolved, "elem"), t("f64"));
  });

  it("f-bounded rec resolves through a multi-file catalog", () => {
    const cat = catalog();
    cat.addXml(
      "color.xml",
      `
        <blocks id="example" name="Example">
          <type name="rec" ns="example">
            <param name="E">
              <extends type="rec">
                <t type="E"/>
              </extends>
            </param>
          </type>
          <type name="Color" ns="example">
            <ancestor type="rec">
              <t type="Color"/>
            </ancestor>
          </type>
          <block id="b_color_fn" name="Color.fn" ns="example">
            <out name="value" type="c1">
              <t type="Color"/>
            </out>
          </block>
          <block id="b_rec_new" name="rec.new" ns="example">
            <param name="T">
              <extends type="rec">
                <t type="T"/>
              </extends>
            </param>
            <in name="cls" type="c1">
              <t type="T"/>
            </in>
            <out name="value" type="T"/>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(
      cat,
      "b_rec_new",
      new Map([["cls", { kind: "single", ty: g("c1", [t("Color")]) }]]),
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
              <extends type="c1">
                <t type="f64"/>
              </extends>
            </param>
            <in name="in" type="N"/>
            <out name="out" type="N"/>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(cat, "need_c1", new Map([["in", { kind: "single", ty: t("i32") }]]));
    expect(resolved.compatible.get("in")).toBe(false);
  });

  it("builder self type is namespace", () => {
    const cat = new Catalog();
    cat.addXml(
      "mod.xml",
      `
        <blocks id="mod" name="Module">
          <block id="b_path" name="path" ns="example.Builder">
            <factory id="Builder#path"/>
            <in name="segment" type="str"/>
            <out name="this">
              <self/>
            </out>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(cat, "b_path", new Map([["segment", { kind: "single", ty: t("str") }]]));
    expectType(resolvedOutput(resolved, "this"), t("example.Builder"));
  });

  it("diagram associates multiple xml files and grounds inputs", () => {
    const diagram = new Diagram("d1", "Demo");
    associateFixtureModels(diagram);
    expect(diagram.sources().length).toBe(3);

    const f64Id = diagram.addNode("b_f64");
    const i32Id = diagram.addNode("b_i32");
    const arrayId = diagram.addNode("b_array_of");
    const getId = diagram.addNode("b_array_get");
    const processId = diagram.addNode("b_process");

    diagram.addLink(f64Id, "value", arrayId, "elems");
    diagram.addLink(arrayId, "result", getId, "array");
    diagram.addLink(i32Id, "value", getId, "index");
    diagram.addLink(arrayId, "result", processId, "in");

    expectType(resolvedOutput(diagram.resolveNode(arrayId)!, "result"), arrayOf(t("f64")));
    expectType(resolvedOutput(diagram.resolveNode(getId)!, "elem"), t("f64"));
    expectType(resolvedOutput(diagram.resolveNode(processId)!, "out"), arrayOf(t("f64")));
  });

  it("diagram chain grounds through identity", () => {
    const diagram = new Diagram("d2", "Chain");
    associateFixtureModels(diagram);
    const f64Id = diagram.addNode("b_f64");
    const identId = diagram.addNode("b_identity");
    const arrayId = diagram.addNode("b_array_of");
    diagram.addLink(f64Id, "value", identId, "in");
    diagram.addLink(identId, "out", arrayId, "elems");
    expectType(resolvedOutput(diagram.resolveNode(arrayId)!, "result"), arrayOf(t("f64")));
  });

  it("dissociate xml rebuilds catalog", () => {
    const diagram = new Diagram("d3", "Drop");
    associateFixtureModels(diagram);
    diagram.addNode("b_array_of");
    diagram.dissociateXml("fixtures.xml");
    expect(diagram.catalog().block("b_array_of")).toBeUndefined();
    expect(diagram.catalog().block("timer")).toBeDefined();
    expect(diagram.nodes().length).toBe(0);
  });

  it("variance display", () => {
    expect(displayType(extendsBound(t("i32")), true)).toBe("? extends i32");
    expect(parseVariance("+")).toBe("covariant");
  });

  it("displays common types in compact form", () => {
    expect(displayType(g("c1", [t("f64")]), true)).toBe("c<f64>");
    expect(displayType(g("c1", [g("c1", [t("f64")])]), true)).toBe("c<c<f64>>");
    expect(displayType(g("c1", [g("c1", [g("c1", [t("f64")])])]), true)).toBe("c<c<c<f64>>>");
    expect(typeToString(g("c1", [g("c1", [g("c1", [t("f64")])])]))).toBe("c<c<c<f64>>>");
    expect(displayType(g("c1", [g("c1", [g("c1", [t("f64")])])]), false)).toBe("c1<c1<c1<f64>>>");
    expect(displayType(g("f1", [t("i32"), t("str")]), true)).toBe("f1<i32, str>");
    expect(displayType(g("f2", [t("i32"), t("i64"), t("bool")]), true)).toBe("f2<i32, i64, bool>");
    expect(displayType(g("s", [t("f64")]), true)).toBe("s<f64>");
    expect(displayType(g("c2", [t("str"), t("bool")]), true)).toBe("c2<str, bool>");
    expect(displayType(t("f64"), true)).toBe("f64");
    expect(displayType(arrayOf(t("f64")), true)).toBe("f64[]");
    expect(displayType(arrayOf(arrayOf(t("i32"))), true)).toBe("i32[][]");
    expect(displayType({ kind: "union", members: [t("i32"), t("i64")] }, true)).toBe("i32 | i64");
    expect(displayType(arrayOf({ kind: "union", members: [t("i32"), t("i64")] }), true)).toBe("(i32 | i64)[]");
  });

  it("control systems model and types", () => {
    const cat = catalog();
    const timerBlock = cat.block("timer")!;
    expect(timerBlock.inputs.length).toBe(0);
    expect(timerBlock.outputs.length).toBe(1);
    expect(displayType(timerBlock.outputs.find((port) => port.name === "out")!.ty, true)).toBe("c<f64>");
    expect(timerBlock.outputs.find((port) => port.name === "out")!.attributes.find((a) => a.name === "wasm")?.value).toBe(
      "f64",
    );
    expect(timerBlock.attributes.find((a) => a.name === "runnable")?.value).toBe("true");
    const scope = cat.block("oscilloscope")!;
    expect(scope.outputs.length).toBe(0);
    expect(scope.inputs.find((port) => port.name === "in")!.vararg).toBe(true);
    expect(displayType(scope.inputs.find((port) => port.name === "in")!.ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("quantizer")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("quantizer")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("sin")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("sin")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("cos")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("c<f64>");
    expect(displayType(cat.block("cos")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("c<f64>");
    expect(timerBlock.ns).toBe("com.dauch.cs.gen");
    expect(cat.block("quantizer")!.ns).toBe("com.dauch.cs");
    expect(cat.block("sin")!.ns).toBe("com.dauch.cs.transform");
    expect(cat.block("cos")!.ns).toBe("com.dauch.cs.transform");
    expect(scope.ns).toBe("com.dauch.cs.sink");
    expect(cat.namespaceLabel("com.dauch.cs")).toBe("Control Systems");
    expect(cat.namespaceLabel("com.dauch.cs.gen")).toBe("Gen");
    expect(cat.namespaceLabel("com.dauch.cs.transform")).toBe("Transform");
    expect(cat.namespaceLabel("com.dauch.cs.sink")).toBe("Sink");
    expect(cat.namespaces.get("com.dauch.cs.gen")?.parent).toBe("com.dauch.cs");
    expect(cat.namespaces.get("com.dauch.cs.transform")?.parent).toBe("com.dauch.cs");
    expect(cat.namespaces.get("com.dauch.cs.sink")?.parent).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs.gen")).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs.transform")).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs.sink")).toBe("com.dauch.cs");
    expect(cat.namespaceParent("com.dauch.cs")).toBeNull();
    expect(cat.findType("f64")).toBeDefined();
    expect(cat.findType("c1")).toBeDefined();
    expect(cat.findType("s")).toBeDefined();
    expect(cat.findType("f1")).toBeDefined();
  });

  it("nested consumers are not f64 sample ports", () => {
    const cat = catalog();
    const nested = g("c1", [g("c1", [g("c1", [t("f64")])])]);
    const mid = g("c1", [g("c1", [t("f64")])]);
    const leaf = g("c1", [t("f64")]);
    expect(isCompatible(cat, [], nested, t("f64"))).toBe(false);
    expect(isCompatible(cat, [], mid, t("f64"))).toBe(false);
    expect(isCompatible(cat, [], leaf, t("f64"))).toBe(false);
    expect(isCompatible(cat, [], mid, nested)).toBe(false);
    expect(isCompatible(cat, [], leaf, mid)).toBe(false);
    expect(isCompatible(cat, [], nested, nested)).toBe(true);
    expect(isCompatible(cat, [], mid, mid)).toBe(true);
    expect(isCompatible(cat, [], leaf, leaf)).toBe(true);
  });

  it("c1 is a consumer type that can be forked into one input", () => {
    expect(isConsumerType(g("c1", [t("f64")]))).toBe(true);
    expect(isConsumerType(t("f64"))).toBe(false);
    expect(isConsumerType(g("f1", [t("f64"), t("f64")]))).toBe(false);
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

  it("plans a hidden fork when two oscilloscopes share a timer output", () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "oscilloscope" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 4, fromOut: "out", toBlock: 1, toIn: "in" },
      { fromBlock: 4, fromOut: "out", toBlock: 2, toIn: "in" },
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
      { scopeId: 1, label: "in" },
      { scopeId: 2, label: "in" },
    ]);
  });

  it("plans two vararg channels on one oscilloscope as a multiplot", () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "cos" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 4, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 1, toIn: "in" },
    ];
    const plan = planGenerator(4, nodes, links)!;
    expect(plan.tree).toEqual({
      kind: "fork",
      inner: [
        { kind: "stage", stage: "sin", inner: { kind: "scope", id: 1 } },
        { kind: "stage", stage: "cos", inner: { kind: "scope", id: 1 } },
      ],
    });
    expect(plan.scopeIds).toEqual([1]);
    expect(plan.channels).toEqual([
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

  it("cos maps samples", () => {
    const out: number[] = [];
    const mapped = cos((value) => out.push(value));
    mapped(0);
    mapped(Math.PI);
    expect(Math.abs(out[0] - 1)).toBeLessThan(1e-9);
    expect(Math.abs(out[1] + 1)).toBeLessThan(1e-9);
  });

  it("compile generator emits typed-function wasm", async () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "quantizer" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" },
    ];
    const compiled = (await compileGenerator(4, nodes, links))!;
    expect(compiled.scopeId).toBe(1);
    expect(compiled.delayMs).toBe(QUANTIZER_DELAY_MS);
    expect(compiled.text).toContain("(type $fn_timer (func (param i32) (result f64)))");
    expect(compiled.text).toContain("(type $fn_quantizer (func (param i32 f64) (result f64)))");
    expect(compiled.text).toContain("(type $fn_oscilloscope (func (param i32 f64)))");
    expect(compiled.text).toContain("(func $timer (type $fn_timer) (param $ctx i32) (result f64)");
    expect(compiled.text).toContain("(func $quantizer");
    expect(compiled.text).toContain("(param $ctx i32) (param $in f64) (result f64)");
    expect(compiled.text).toContain("(func $sin");
    expect(compiled.text).toContain("(func $cos");
    expect(compiled.text).toContain("(func $oscilloscope (type $fn_oscilloscope) (param $ctx i32) (param $in f64)");
    expect(compiled.text).toContain("call_ref $fn_timer");
    expect(compiled.text).toContain("ref.func $quantizer");
    expect(compiled.text).toContain("ref.func $sin");
    expect(compiled.text).toContain("call_ref $fn_oscilloscope");
    expect(compiled.text).toContain("memory.atomic.wait32");
    expect(compiled.text).toContain('(export "run"');
    expect(compiled.text).not.toContain("setTimeout");
    expect(WebAssembly.validate(compiled.wasm.slice().buffer)).toBe(true);
  });

  it("compile timer chain sines into scope", async () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "quantizer" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" },
    ];
    const buffers = new Map<number, SampleBuf>([[1, new SampleBuf()]]);
    const compiled = (await compileTimer(4, nodes, links, buffers))!;
    compiled.emit(0);
    compiled.emit(Math.PI / 2);
    const got = buffers.get(1)!.snapshot();
    expect(Math.abs(got[0])).toBeLessThan(1e-9);
    expect(Math.abs(got[1] - 1)).toBeLessThan(1e-9);
    expect(compiled.delayMs).toBe(QUANTIZER_DELAY_MS);
  });

  it("compile generator walks a cos stage", async () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "cos" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 4, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" },
    ];
    const compiled = (await compileGenerator(4, nodes, links))!;
    expect(compiled.stages).toEqual(["cos"]);
    expect(compiled.text).toContain("ref.func $cos");
  });

  it("compile generator emits a fork into two push rings", async () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "oscilloscope" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 4, fromOut: "out", toBlock: 1, toIn: "in" },
      { fromBlock: 4, fromOut: "out", toBlock: 2, toIn: "in" },
    ];
    const compiled = (await compileGenerator(4, nodes, links))!;
    expect(compiled.scopeIds).toEqual([1, 2]);
    expect(compiled.text).toContain("call_ref $fn_oscilloscope");
    expect(compiled.text).toContain("call $push_at");
    expect(WebAssembly.validate(compiled.wasm.slice().buffer)).toBe(true);
  });

  it("compile timer needs oscilloscope", async () => {
    const nodes = [
      { id: 3, defId: "quantizer" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [{ fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in" }];
    expect(await compileGenerator(4, nodes, links)).toBeUndefined();
    expect(await compileTimer(4, nodes, links, new Map())).toBeUndefined();
  });

  it("control systems diagram grounds nested func chain", () => {
    const diagram = new Diagram("cs", "Control Systems");
    associateBuiltinModels(diagram);
    const timerId = diagram.addNode("timer");
    const quantizerId = diagram.addNode("quantizer");
    const sinId = diagram.addNode("sin");
    const scopeId = diagram.addNode("oscilloscope");
    diagram.addLink(timerId, "out", quantizerId, "in");
    diagram.addLink(quantizerId, "out", sinId, "in");
    diagram.addLink(sinId, "out", scopeId, "in");

    const timerResolved = diagram.resolveNode(timerId)!;
    expect(displayType(timerResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("c<f64>");

    const quantizerResolved = diagram.resolveNode(quantizerId)!;
    expect(quantizerResolved.compatible.get("in") ?? true).toBe(true);
    expect(displayType(quantizerResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("c<f64>");
    expect(displayType(quantizerResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("c<f64>");

    const sinResolved = diagram.resolveNode(sinId)!;
    expect(sinResolved.compatible.get("in") ?? true).toBe(true);
    expect(displayType(sinResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("c<f64>");
    expect(displayType(sinResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("c<f64>");

    const scopeResolved = diagram.resolveNode(scopeId)!;
    expect(scopeResolved.inputs.find((port) => port.name === "in")!.vararg).toBe(true);
    expect(displayType(scopeResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("c<f64>");
  });

  it("two signals may ground the same oscilloscope vararg input", () => {
    const diagram = new Diagram("cs", "Fork");
    associateBuiltinModels(diagram);
    const scopeId = diagram.addNode("oscilloscope");
    const sinId = diagram.addNode("sin");
    const cosId = diagram.addNode("cos");
    diagram.addLink(sinId, "out", scopeId, "in");
    diagram.addLink(cosId, "out", scopeId, "in");
    expect(diagram.links()).toHaveLength(2);
    expect(diagram.resolveNode(scopeId)!.compatible.get("in") ?? true).toBe(true);
  });

  it("sin wires to oscilloscope because both ports are c<f64>", () => {
    const diagram = new Diagram("cs", "Same");
    associateBuiltinModels(diagram);
    const scopeId = diagram.addNode("oscilloscope");
    const sinId = diagram.addNode("sin");
    diagram.addLink(sinId, "out", scopeId, "in");
    expect(diagram.resolveNode(scopeId)!.compatible.get("in") ?? true).toBe(true);
  });

  it("array is incompatible with an f64 sample port", () => {
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
    timer(oscilloscope((value) => left.push(value), (value) => right.push(value)), running, () => 4);
    expect(left).toEqual([4]);
    expect(right).toEqual([4]);
  });

  it("compile timer forks into two scope buffers", async () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "oscilloscope" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 4, fromOut: "out", toBlock: 1, toIn: "in" },
      { fromBlock: 4, fromOut: "out", toBlock: 2, toIn: "in" },
    ];
    const buffers = new Map<number, SampleBuf>([
      [1, new SampleBuf()],
      [2, new SampleBuf()],
    ]);
    const compiled = (await compileTimer(4, nodes, links, buffers))!;
    compiled.emit(3);
    expect(buffers.get(1)!.snapshot()).toEqual([3]);
    expect(buffers.get(2)!.snapshot()).toEqual([3]);
  });

  it("compile timer writes two rings for one vararg oscilloscope", async () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "cos" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 4, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 1, toIn: "in" },
    ];
    const buffers = new Map<number, SampleBuf>([
      [0, new SampleBuf()],
      [1, new SampleBuf()],
    ]);
    const compiled = (await compileTimer(4, nodes, links, buffers))!;
    compiled.emit(0);
    expect(Math.abs(buffers.get(0)!.snapshot()[0])).toBeLessThan(1e-9);
    expect(Math.abs(buffers.get(1)!.snapshot()[0] - 1)).toBeLessThan(1e-9);
  });

  it("interprets the wired chain as oscilloscope(sin(quantizer(timer())))", () => {
    const out: number[] = [];
    let live = true;
    const running = () => {
      const next = live;
      live = false;
      return next;
    };
    timer(oscilloscope(sin(quantizer((value) => out.push(value), 0))), running, () => Math.PI / 2);
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

  it("generator text uses typed func types even without stages", async () => {
    const text = await generatorText([]);
    expect(text).toContain("(type $fn_timer (func (param i32) (result f64)))");
    expect(text).toContain("(func $tick");
    expect(text).toContain('(export "tick"');
    expect(text).toContain("call_ref $fn_timer");
    expect(text).toContain("call_ref $fn_oscilloscope");
    expect(text).not.toContain("ref.func $sin");
  });
});
