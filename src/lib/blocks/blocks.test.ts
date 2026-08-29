import { describe, expect, it } from "vitest";
import {
  type TypeExpr,
  displayType,
  extendsBound,
  generic,
  named,
  parseVariance,
  typesEqual,
  unbounded,
} from "./ast";
import {
  CONTROL_SYSTEMS_XML,
  FLOW_XML,
  JAVA_LANG_XML,
  JAVA_UTIL_XML,
  associateBuiltinModels,
} from "./builtin";
import { Catalog } from "./catalog";
import { isCompatible } from "./compat";
import { QUANTIZER_DELAY_MS, SampleBuf, compileTimer, sinConsumer, spawnTimer, stop } from "./cs";
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
  next.addXml("java-lang.xml", JAVA_LANG_XML);
  next.addXml("java-util.xml", JAVA_UTIL_XML);
  next.addXml("flow.xml", FLOW_XML);
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
  it("parses blocks.md map example", () => {
    const xml = `
      <blocks id="workspace_01" name="Data Processing" icon="workspace.png">
        <namespace id="java.util" name="Java Utilities" icon="box.png"/>
        <block id="b_create_map" name="Create Map" ns="java.util" icon="map.png">
          <param name="K"/>
          <param name="V"/>
          <factory id="Map#of">
            <t type="K"/>
            <t type="V"/>
          </factory>
          <in name="key" type="K"/>
          <in name="val" type="V"/>
          <out name="result" type="Map">
            <t type="K"/>
            <t type="V"/>
          </out>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("map.xml", xml);
    expect(doc.id).toBe("workspace_01");
    const block = doc.blocks[0];
    expect(block.params.length).toBe(2);
    expectType(block.inputs[0].ty, t("K"));
    expectType(block.outputs[0].ty, g("Map", [t("K"), t("V")]));
  });

  it("parses variance wildcards", () => {
    const xml = `
      <blocks id="w" name="Wildcards">
        <block id="b" name="W" ns="test">
          <in name="covariantInput" type="List">
            <t type="Number" variance="+"/>
          </in>
          <in name="contravariantInput" type="Consumer">
            <t type="String" variance="-"/>
          </in>
          <in name="unboundedInput" type="Class">
            <t variance="?"/>
          </in>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("wild.xml", xml);
    const block = doc.blocks[0];
    expectType(block.inputs[0].ty, g("List", [extendsBound(t("Number"))]));
    expectType(block.inputs[1].ty, g("Consumer", [{ kind: "wildcard", variance: "contravariant", bound: t("String") }]));
    expectType(block.inputs[2].ty, g("Class", [unbounded()]));
  });

  it("parses union intersection and self", () => {
    const xml = `
      <blocks id="u" name="U">
        <block id="b_path" name="path" ns="java.net.http.HttpRequest.Builder">
          <in name="segment" type="String"/>
          <in name="complexPayload">
            <intersection>
              <t type="Serializable"/>
              <t type="Comparable">
                <t type="T"/>
              </t>
            </intersection>
          </in>
          <out name="result">
            <union>
              <t type="String"/>
              <t type="Integer"/>
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
    expectType(block.outputs[0].ty, { kind: "union", members: [t("Integer"), t("String")] });
    expect(block.outputs[1].ty.kind).toBe("self");
    expect(block.inputs[1].ty.kind).toBe("intersection");
  });

  it("parses f-bounded enum param", () => {
    const xml = `
      <blocks id="e" name="E">
        <block id="b_enum_valueof" name="Enum.valueOf" ns="java.lang">
          <param name="T">
            <extends type="Enum">
              <t type="T"/>
            </extends>
          </param>
          <in name="enumType" type="Class">
            <t type="T"/>
          </in>
          <out name="resultEnum" type="T"/>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("e.xml", xml);
    expectType(doc.blocks[0].params[0].extends[0], g("Enum", [t("T")]));
  });

  it("builtin models merge", () => {
    const cat = catalog();
    expect(cat.block("b_list_of")).toBeDefined();
    expect(cat.block("b_start")).toBeDefined();
    expect(cat.block("timer")).toBeDefined();
    expect(cat.findType("List", "java.util")).toBeDefined();
    expect(cat.findType("String", "java.lang")).toBeDefined();
    expect(cat.sources().length).toBe(4);
  });

  it("list of string is compatible with list wildcard", () => {
    const cat = catalog();
    const formal = g("List", [extendsBound(t("CharSequence"))]);
    const actual = g("List", [t("String")]);
    expect(isCompatible(cat, [], formal, actual)).toBe(true);
    const invariant = g("List", [t("CharSequence")]);
    expect(isCompatible(cat, [], invariant, actual)).toBe(false);
  });

  it("array list is a list", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], g("List", [t("String")]), g("ArrayList", [t("String")]))).toBe(true);
  });

  it("consumer contravariance", () => {
    const cat = catalog();
    const formal = g("Consumer", [{ kind: "wildcard", variance: "contravariant", bound: t("String") }]);
    expect(isCompatible(cat, [], formal, g("Consumer", [t("Object")]))).toBe(true);
    expect(isCompatible(cat, [], formal, g("Consumer", [t("Integer")]))).toBe(false);
  });

  it("primitive widening and boxing", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], t("long"), t("int"))).toBe(true);
    expect(isCompatible(cat, [], t("int"), t("long"))).toBe(false);
    expect(isCompatible(cat, [], t("int"), t("Integer"))).toBe(true);
    expect(isCompatible(cat, [], t("Integer"), t("int"))).toBe(true);
  });

  it("infer list of from string grounding", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_list_of",
      new Map([["elements", { kind: "single", ty: t("String") }]]),
    );
    expectType(resolved.params.get("E"), t("String"));
    expectType(resolvedOutput(resolved, "resultList"), g("List", [t("String")]));
    expect(resolved.compatible.get("elements")).toBe(true);
  });

  it("infer list of vararg union", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_list_of",
      new Map([["elements", { kind: "varargs", items: [t("String"), t("Integer")] }]]),
    );
    expectType(resolvedOutput(resolved, "resultList"), g("List", [{ kind: "union", members: [t("Integer"), t("String")] }]));
  });

  it("infer map of from two inputs", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_map_of",
      new Map([
        ["key", { kind: "single", ty: t("String") }],
        ["val", { kind: "single", ty: t("Integer") }],
      ]),
    );
    expectType(resolvedOutput(resolved, "result"), g("Map", [t("String"), t("Integer")]));
  });

  it("unbound param grounds to wildcard", () => {
    const resolved = resolveBlock(catalog(), "b_process", new Map());
    expectType(resolvedOutput(resolved, "out"), unbounded());
  });

  it("process identity from list", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_process",
      new Map([["in", { kind: "single", ty: g("List", [t("String")]) }]]),
    );
    expectType(resolvedOutput(resolved, "out"), g("List", [t("String")]));
  });

  it("list get infers element type", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_list_get",
      new Map([
        ["list", { kind: "single", ty: g("ArrayList", [t("String")]) }],
        ["index", { kind: "single", ty: t("int") }],
      ]),
    );
    expectType(resolvedOutput(resolved, "element"), t("String"));
  });

  it("enum value of f-bounded", () => {
    const cat = catalog();
    cat.addXml(
      "color.xml",
      `
        <blocks id="example" name="Example">
          <type name="Color" ns="example">
            <ancestor type="Enum">
              <t type="Color"/>
            </ancestor>
          </type>
          <block id="b_color_class" name="Color.class" ns="example">
            <out name="value" type="Class">
              <t type="Color"/>
            </out>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(
      cat,
      "b_enum_valueof",
      new Map([
        ["enumType", { kind: "single", ty: g("Class", [t("Color")]) }],
        ["name", { kind: "single", ty: t("String") }],
      ]),
    );
    expectType(resolvedOutput(resolved, "resultEnum"), t("Color"));
    expect(resolved.compatible.get("enumType")).toBe(true);
  });

  it("incompatible grounding is reported", () => {
    const cat = catalog();
    cat.addXml(
      "need.xml",
      `
        <blocks id="b" name="B">
          <block id="need_number" name="Need" ns="test">
            <param name="N">
              <extends type="Number"/>
            </param>
            <in name="in" type="N"/>
            <out name="out" type="N"/>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(cat, "need_number", new Map([["in", { kind: "single", ty: t("String") }]]));
    expect(resolved.compatible.get("in")).toBe(false);
  });

  it("builder self type is namespace", () => {
    const cat = new Catalog();
    cat.addXml(
      "http.xml",
      `
        <blocks id="http" name="HTTP">
          <block id="b_path" name="path" ns="java.net.http.HttpRequest.Builder">
            <factory id="HttpRequest.Builder#path"/>
            <in name="segment" type="String"/>
            <out name="this">
              <self/>
            </out>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(cat, "b_path", new Map([["segment", { kind: "single", ty: t("String") }]]));
    expectType(resolvedOutput(resolved, "this"), t("java.net.http.HttpRequest.Builder"));
  });

  it("diagram associates multiple xml files and grounds inputs", () => {
    const diagram = new Diagram("d1", "Demo");
    associateBuiltinModels(diagram);
    expect(diagram.sources().length).toBe(4);

    const stringId = diagram.addNode("b_string");
    const intId = diagram.addNode("b_integer");
    const listId = diagram.addNode("b_list_of");
    const mapId = diagram.addNode("b_map_of");
    const getId = diagram.addNode("b_list_get");
    const processId = diagram.addNode("b_process");

    diagram.addLink(stringId, "value", listId, "elements");
    diagram.addLink(stringId, "value", mapId, "key");
    diagram.addLink(intId, "value", mapId, "val");
    diagram.addLink(listId, "resultList", getId, "list");
    diagram.addLink(listId, "resultList", processId, "in");

    expectType(resolvedOutput(diagram.resolveNode(listId)!, "resultList"), g("List", [t("String")]));
    expectType(resolvedOutput(diagram.resolveNode(mapId)!, "result"), g("Map", [t("String"), t("Integer")]));
    expectType(resolvedOutput(diagram.resolveNode(getId)!, "element"), t("String"));
    expectType(resolvedOutput(diagram.resolveNode(processId)!, "out"), g("List", [t("String")]));
  });

  it("diagram chain grounds through identity", () => {
    const diagram = new Diagram("d2", "Chain");
    associateBuiltinModels(diagram);
    const stringId = diagram.addNode("b_string");
    const identId = diagram.addNode("b_identity");
    const optId = diagram.addNode("b_optional_of");
    diagram.addLink(stringId, "value", identId, "in");
    diagram.addLink(identId, "out", optId, "value");
    expectType(resolvedOutput(diagram.resolveNode(optId)!, "result"), g("Optional", [t("String")]));
  });

  it("dissociate xml rebuilds catalog", () => {
    const diagram = new Diagram("d3", "Drop");
    associateBuiltinModels(diagram);
    diagram.addNode("b_list_of");
    diagram.dissociateXml("java-util.xml");
    expect(diagram.catalog().block("b_list_of")).toBeUndefined();
    expect(diagram.catalog().block("b_string")).toBeDefined();
    expect(diagram.nodes().length).toBe(0);
  });

  it("variance display", () => {
    expect(displayType(extendsBound(t("Number")), true)).toBe("? extends Number");
    expect(parseVariance("+")).toBe("covariant");
  });

  it("control systems model and types", () => {
    const cat = catalog();
    const timer = cat.block("timer")!;
    expect(timer.outputs.length).toBe(0);
    expect(displayType(timer.inputs.find((port) => port.name === "consumer")!.ty, true)).toBe(
      "Consumer<Consumer<Double>>",
    );
    expect(timer.attributes.find((a) => a.name === "runnable")?.value).toBe("true");
    const scope = cat.block("oscilloscope")!;
    expect(displayType(scope.outputs.find((port) => port.name === "out")!.ty, true)).toBe("Consumer<Double>");
    expect(displayType(cat.block("quantizer")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe(
      "Consumer<Consumer<Double>>",
    );
    expect(displayType(cat.block("sin")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe(
      "Consumer<Double>",
    );
    expect(cat.namespaceLabel("cs")).toBe("Control Systems");
    expect(cat.findType("double", "java.lang")).toBeDefined();
    expect(cat.findType("DoubleConsumer", "java.util.function")).toBeDefined();
  });

  it("sin maps samples", () => {
    const out: number[] = [];
    const mapped = sinConsumer((value) => out.push(value));
    mapped(0);
    mapped(Math.PI / 2);
    expect(Math.abs(out[0])).toBeLessThan(1e-9);
    expect(Math.abs(out[1] - 1)).toBeLessThan(1e-9);
  });

  it("compile timer chain sines into scope", () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "quantizer" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "consumer" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "consumer" },
    ];
    const buffers = new Map<number, SampleBuf>([[1, new SampleBuf()]]);
    const compiled = compileTimer(4, nodes, links, buffers)!;
    compiled.emit(0);
    compiled.emit(Math.PI / 2);
    const got = buffers.get(1)!.snapshot();
    expect(Math.abs(got[0])).toBeLessThan(1e-9);
    expect(Math.abs(got[1] - 1)).toBeLessThan(1e-9);
    expect(compiled.delayMs).toBe(QUANTIZER_DELAY_MS);
  });

  it("compile timer needs oscilloscope", () => {
    const nodes = [
      { id: 3, defId: "quantizer" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [{ fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "consumer" }];
    expect(compileTimer(4, nodes, links, new Map())).toBeUndefined();
  });

  it("control systems diagram grounds consumer chain", () => {
    const diagram = new Diagram("cs", "Control Systems");
    associateBuiltinModels(diagram);
    const scope = diagram.addNode("oscilloscope");
    const sin = diagram.addNode("sin");
    const quantizer = diagram.addNode("quantizer");
    const timer = diagram.addNode("timer");
    diagram.addLink(scope, "out", sin, "in");
    diagram.addLink(sin, "out", quantizer, "consumer");
    diagram.addLink(quantizer, "out", timer, "consumer");

    const timerResolved = diagram.resolveNode(timer)!;
    expect(timerResolved.compatible.get("consumer") ?? true).toBe(true);
    expect(displayType(timerResolved.inputs.find((port) => port.name === "consumer")!.ty, true)).toBe(
      "Consumer<Consumer<Double>>",
    );

    const sinResolved = diagram.resolveNode(sin)!;
    expect(sinResolved.compatible.get("in") ?? true).toBe(true);
    expect(displayType(sinResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("Consumer<Double>");
    expect(displayType(sinResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe(
      "Consumer<Consumer<Double>>",
    );
  });

  it("spawn timer emits until stopped", async () => {
    const buf = new SampleBuf();
    const compiled = {
      emit: (value: number) => buf.push(value),
      delayMs: 1,
    };
    const running = { value: true };
    spawnTimer(compiled, running);
    await new Promise((resolve) => setTimeout(resolve, 40));
    stop(running);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(buf.snapshot().length).toBeGreaterThan(0);
    buf.clear();
    expect(buf.snapshot().length).toBe(0);
  });
});
