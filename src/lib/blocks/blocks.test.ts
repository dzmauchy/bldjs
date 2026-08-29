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
import { CONTROL_SYSTEMS_XML, FLOW_XML, WASM_XML, associateBuiltinModels } from "./builtin";
import { Catalog } from "./catalog";
import { isCompatible } from "./compat";
import {
  QUANTIZER_DELAY_MS,
  SampleBuf,
  compileGenerator,
  compileTimer,
  generatorWat,
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
  next.addXml("wasm.xml", WASM_XML);
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
      <blocks id="workspace_01" name="Signal Processing" icon="workspace.png">
        <namespace id="wasm" name="WebAssembly" icon="box.png"/>
        <block id="b_create_map" name="Create Map" ns="wasm" icon="map.png">
          <param name="K"/>
          <param name="V"/>
          <factory id="map#of">
            <t type="K"/>
            <t type="V"/>
          </factory>
          <in name="key" type="K"/>
          <in name="val" type="V"/>
          <out name="result" type="map">
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
    expectType(block.outputs[0].ty, g("map", [t("K"), t("V")]));
  });

  it("parses variance wildcards", () => {
    const xml = `
      <blocks id="w" name="Wildcards">
        <block id="b" name="W" ns="test">
          <in name="covariantInput" type="table">
            <t type="i32" variance="+"/>
          </in>
          <in name="contravariantInput" type="func">
            <t type="f64" variance="-"/>
          </in>
          <in name="unboundedInput" type="table">
            <t variance="?"/>
          </in>
        </block>
      </blocks>
    `;
    const doc = parseBlocks("wild.xml", xml);
    const block = doc.blocks[0];
    expectType(block.inputs[0].ty, g("table", [extendsBound(t("i32"))]));
    expectType(block.inputs[1].ty, g("func", [{ kind: "wildcard", variance: "contravariant", bound: t("f64") }]));
    expectType(block.inputs[2].ty, g("table", [unbounded()]));
  });

  it("parses union intersection and self", () => {
    const xml = `
      <blocks id="u" name="U">
        <block id="b_path" name="path" ns="wasm.module.Builder">
          <in name="segment" type="externref"/>
          <in name="complexPayload">
            <intersection>
              <t type="funcref"/>
              <t type="func">
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
        <block id="b_rec_new" name="rec.new" ns="wasm">
          <param name="T">
            <extends type="rec">
              <t type="T"/>
            </extends>
          </param>
          <in name="cls" type="func">
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
    const cat = catalog();
    expect(cat.block("b_table_of")).toBeDefined();
    expect(cat.block("b_start")).toBeDefined();
    expect(cat.block("timer")).toBeDefined();
    expect(cat.findType("func", "wasm")).toBeDefined();
    expect(cat.findType("f64", "wasm")).toBeDefined();
    expect(cat.sources().length).toBe(3);
  });

  it("table of f64 is compatible with table wildcard", () => {
    const cat = catalog();
    const formal = g("table", [extendsBound(t("f64"))]);
    const actual = g("table", [t("f64")]);
    expect(isCompatible(cat, [], formal, actual)).toBe(true);
    const invariant = g("table", [t("i32")]);
    expect(isCompatible(cat, [], invariant, actual)).toBe(false);
  });

  it("typed func is a funcref", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], t("funcref"), g("func", [t("f64")]))).toBe(true);
    expect(isCompatible(cat, [], g("func", [t("f64")]), t("funcref"))).toBe(false);
  });

  it("func contravariance", () => {
    const cat = catalog();
    const formal = g("func", [{ kind: "wildcard", variance: "contravariant", bound: g("func", [t("f64")]) }]);
    expect(isCompatible(cat, [], formal, g("func", [t("funcref")]))).toBe(true);
    expect(isCompatible(cat, [], formal, g("func", [t("i32")]))).toBe(false);
  });

  it("wasm value types do not widen", () => {
    const cat = catalog();
    expect(isCompatible(cat, [], t("i64"), t("i32"))).toBe(false);
    expect(isCompatible(cat, [], t("i32"), t("i64"))).toBe(false);
    expect(isCompatible(cat, [], t("f64"), t("f32"))).toBe(false);
    expect(isCompatible(cat, [], t("f64"), t("f64"))).toBe(true);
  });

  it("infer table of from f64 grounding", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_table_of",
      new Map([["elems", { kind: "single", ty: t("f64") }]]),
    );
    expectType(resolved.params.get("T"), t("f64"));
    expectType(resolvedOutput(resolved, "result"), g("table", [t("f64")]));
    expect(resolved.compatible.get("elems")).toBe(true);
  });

  it("infer table of vararg union", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_table_of",
      new Map([["elems", { kind: "varargs", items: [t("f64"), t("i32")] }]]),
    );
    expectType(resolvedOutput(resolved, "result"), g("table", [{ kind: "union", members: [t("f64"), t("i32")] }]));
  });

  it("infer map of from two inputs", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_map_of",
      new Map([
        ["key", { kind: "single", ty: t("i32") }],
        ["val", { kind: "single", ty: t("f64") }],
      ]),
    );
    expectType(resolvedOutput(resolved, "result"), g("map", [t("i32"), t("f64")]));
  });

  it("unbound param grounds to wildcard", () => {
    const resolved = resolveBlock(catalog(), "b_process", new Map());
    expectType(resolvedOutput(resolved, "out"), unbounded());
  });

  it("process identity from table", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_process",
      new Map([["in", { kind: "single", ty: g("table", [t("f64")]) }]]),
    );
    expectType(resolvedOutput(resolved, "out"), g("table", [t("f64")]));
  });

  it("table get infers element type", () => {
    const resolved = resolveBlock(
      catalog(),
      "b_table_get",
      new Map([
        ["table", { kind: "single", ty: g("table", [t("f64")]) }],
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
            <out name="value" type="func">
              <t type="Color"/>
            </out>
          </block>
          <block id="b_rec_new" name="rec.new" ns="example">
            <param name="T">
              <extends type="rec">
                <t type="T"/>
              </extends>
            </param>
            <in name="cls" type="func">
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
      new Map([["cls", { kind: "single", ty: g("func", [t("Color")]) }]]),
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
          <block id="need_funcref" name="Need" ns="test">
            <param name="N">
              <extends type="funcref"/>
            </param>
            <in name="in" type="N"/>
            <out name="out" type="N"/>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(cat, "need_funcref", new Map([["in", { kind: "single", ty: t("i32") }]]));
    expect(resolved.compatible.get("in")).toBe(false);
  });

  it("builder self type is namespace", () => {
    const cat = new Catalog();
    cat.addXml(
      "mod.xml",
      `
        <blocks id="mod" name="Module">
          <block id="b_path" name="path" ns="wasm.module.Builder">
            <factory id="Builder#path"/>
            <in name="segment" type="externref"/>
            <out name="this">
              <self/>
            </out>
          </block>
        </blocks>
      `,
    );
    const resolved = resolveBlock(cat, "b_path", new Map([["segment", { kind: "single", ty: t("externref") }]]));
    expectType(resolvedOutput(resolved, "this"), t("wasm.module.Builder"));
  });

  it("diagram associates multiple xml files and grounds inputs", () => {
    const diagram = new Diagram("d1", "Demo");
    associateBuiltinModels(diagram);
    expect(diagram.sources().length).toBe(3);

    const f64Id = diagram.addNode("b_f64");
    const i32Id = diagram.addNode("b_i32");
    const tableId = diagram.addNode("b_table_of");
    const mapId = diagram.addNode("b_map_of");
    const getId = diagram.addNode("b_table_get");
    const processId = diagram.addNode("b_process");

    diagram.addLink(f64Id, "value", tableId, "elems");
    diagram.addLink(i32Id, "value", mapId, "key");
    diagram.addLink(f64Id, "value", mapId, "val");
    diagram.addLink(tableId, "result", getId, "table");
    diagram.addLink(tableId, "result", processId, "in");

    expectType(resolvedOutput(diagram.resolveNode(tableId)!, "result"), g("table", [t("f64")]));
    expectType(resolvedOutput(diagram.resolveNode(mapId)!, "result"), g("map", [t("i32"), t("f64")]));
    expectType(resolvedOutput(diagram.resolveNode(getId)!, "elem"), t("f64"));
    expectType(resolvedOutput(diagram.resolveNode(processId)!, "out"), g("table", [t("f64")]));
  });

  it("diagram chain grounds through identity", () => {
    const diagram = new Diagram("d2", "Chain");
    associateBuiltinModels(diagram);
    const f64Id = diagram.addNode("b_f64");
    const identId = diagram.addNode("b_identity");
    const globalId = diagram.addNode("b_global_of");
    diagram.addLink(f64Id, "value", identId, "in");
    diagram.addLink(identId, "out", globalId, "value");
    expectType(resolvedOutput(diagram.resolveNode(globalId)!, "result"), g("global", [t("f64")]));
  });

  it("dissociate xml rebuilds catalog", () => {
    const diagram = new Diagram("d3", "Drop");
    associateBuiltinModels(diagram);
    diagram.addNode("b_table_of");
    diagram.dissociateXml("wasm.xml");
    expect(diagram.catalog().block("b_table_of")).toBeUndefined();
    expect(diagram.catalog().block("b_start")).toBeDefined();
    expect(diagram.nodes().length).toBe(0);
  });

  it("variance display", () => {
    expect(displayType(extendsBound(t("i32")), true)).toBe("? extends i32");
    expect(parseVariance("+")).toBe("covariant");
  });

  it("displays typed functions in compact form", () => {
    expect(displayType(g("func", [t("f64")]), true)).toBe("fn<f64>");
    expect(displayType(g("func", [g("func", [t("f64")])]), true)).toBe("fn<fn<f64>>");
    expect(displayType(g("func", [g("func", [g("func", [t("f64")])])]), true)).toBe("fn<fn<fn<f64>>>");
    expect(displayType(t("f64"), true)).toBe("f64");
    expect(displayType(g("func", [t("f64")]), false)).toBe("func<f64>");
    expect(displayType(g("table", [t("f64")]), true)).toBe("table<f64>");
  });

  it("control systems model and types", () => {
    const cat = catalog();
    const timerBlock = cat.block("timer")!;
    expect(timerBlock.inputs.length).toBe(0);
    expect(displayType(timerBlock.outputs.find((port) => port.name === "out")!.ty, true)).toBe("f64");
    expect(timerBlock.attributes.find((a) => a.name === "runnable")?.value).toBe("true");
    const scope = cat.block("oscilloscope")!;
    expect(scope.outputs.length).toBe(0);
    expect(displayType(scope.inputs.find((port) => port.name === "in")!.ty, true)).toBe("f64");
    expect(displayType(cat.block("quantizer")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("f64");
    expect(displayType(cat.block("quantizer")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("f64");
    expect(displayType(cat.block("sin")!.inputs.find((port) => port.name === "in")!.ty, true)).toBe("f64");
    expect(displayType(cat.block("sin")!.outputs.find((port) => port.name === "out")!.ty, true)).toBe("f64");
    expect(cat.namespaceLabel("cs")).toBe("Control Systems");
    expect(cat.findType("f64", "wasm")).toBeDefined();
    expect(cat.findType("func", "wasm")).toBeDefined();
  });

  it("nested funcs are not f64 sample ports", () => {
    const cat = catalog();
    const c3 = g("func", [g("func", [g("func", [t("f64")])])]);
    const c2 = g("func", [g("func", [t("f64")])]);
    const c1 = g("func", [t("f64")]);
    expect(isCompatible(cat, [], c3, t("f64"))).toBe(false);
    expect(isCompatible(cat, [], c2, t("f64"))).toBe(false);
    expect(isCompatible(cat, [], c1, t("f64"))).toBe(false);
    expect(isCompatible(cat, [], c2, c3)).toBe(false);
    expect(isCompatible(cat, [], c1, c2)).toBe(false);
    expect(isCompatible(cat, [], c3, c3)).toBe(true);
    expect(isCompatible(cat, [], c2, c2)).toBe(true);
    expect(isCompatible(cat, [], c1, c1)).toBe(true);
  });

  it("sin maps samples", () => {
    const out: number[] = [];
    const mapped = sinFunc((value) => out.push(value));
    mapped(0);
    mapped(Math.PI / 2);
    expect(Math.abs(out[0])).toBeLessThan(1e-9);
    expect(Math.abs(out[1] - 1)).toBeLessThan(1e-9);
  });

  it("compile generator emits typed-function wat", () => {
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
    const compiled = compileGenerator(4, nodes, links)!;
    expect(compiled.scopeId).toBe(1);
    expect(compiled.delayMs).toBe(QUANTIZER_DELAY_MS);
    expect(compiled.wat).toContain("(type $fn_timer (func (param $ctx i32) (result $out f64)))");
    expect(compiled.wat).toContain("(type $fn_quantizer (func (param $ctx i32) (param $in f64) (result $out f64)))");
    expect(compiled.wat).toContain("(type $fn_sin (func (param $ctx i32) (param $in f64) (result $out f64)))");
    expect(compiled.wat).toContain("(type $fn_oscilloscope (func (param $ctx i32) (param $in f64)))");
    expect(compiled.wat).toContain('(func $timer (export "timer") (type $fn_timer) (param $ctx i32) (result $out f64)');
    expect(compiled.wat).toContain('(func $quantizer (export "quantizer") (type $fn_quantizer) (param $ctx i32) (param $in f64) (result $out f64)');
    expect(compiled.wat).toContain('(func $sin (export "sin") (type $fn_sin) (param $ctx i32) (param $in f64) (result $out f64)');
    expect(compiled.wat).toContain('(func $oscilloscope (export "oscilloscope") (type $fn_oscilloscope) (param $ctx i32) (param $in f64)');
    expect(compiled.wat).toContain("call_ref $fn_timer");
    expect(compiled.wat).toContain("call_ref $fn_quantizer");
    expect(compiled.wat).toContain("call_ref $fn_sin");
    expect(compiled.wat).toContain("call_ref $fn_oscilloscope");
    expect(compiled.wat).toContain("memory.atomic.wait32");
    expect(compiled.wat).toContain('(export "run"');
    expect(compiled.wat).not.toContain("setTimeout");
  });

  it("compile timer chain sines into scope", () => {
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
    const links: Link[] = [{ fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in" }];
    expect(compileGenerator(4, nodes, links)).toBeUndefined();
    expect(compileTimer(4, nodes, links, new Map())).toBeUndefined();
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
    expect(displayType(timerResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("f64");

    const quantizerResolved = diagram.resolveNode(quantizerId)!;
    expect(quantizerResolved.compatible.get("in") ?? true).toBe(true);
    expect(displayType(quantizerResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("f64");
    expect(displayType(quantizerResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("f64");

    const sinResolved = diagram.resolveNode(sinId)!;
    expect(sinResolved.compatible.get("in") ?? true).toBe(true);
    expect(displayType(sinResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("f64");
    expect(displayType(sinResolved.outputs.find((port) => port.name === "out")!.ty, true)).toBe("f64");

    const scopeResolved = diagram.resolveNode(scopeId)!;
    expect(scopeResolved.compatible.get("in") ?? true).toBe(true);
    expect(displayType(scopeResolved.inputs.find((port) => port.name === "in")!.ty, true)).toBe("f64");
  });

  it("skipping a nested func layer is incompatible", () => {
    const diagram = new Diagram("cs", "Skip");
    associateBuiltinModels(diagram);
    const tableId = diagram.addNode("b_table_of");
    const sinId = diagram.addNode("sin");
    diagram.addLink(tableId, "result", sinId, "in");

    const sinResolved = diagram.resolveNode(sinId)!;
    expect(sinResolved.compatible.get("in")).toBe(false);
  });

  it("interprets the wired chain as oscilloscope(sin(quantizer(timer())))", () => {
    const out: number[] = [];
    oscilloscope(sin(quantizer(timer(() => Math.PI / 2))), (value) => out.push(value));
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

  it("generator wat uses typed func types even without stages", () => {
    const wat = generatorWat([]);
    expect(wat).toContain("(type $fn_timer (func (param $ctx i32) (result $out f64)))");
    expect(wat).toContain('(func $tick (export "tick")');
    expect(wat).toContain("call_ref $fn_timer");
    expect(wat).toContain("call_ref $fn_oscilloscope");
    expect(wat).not.toContain("ref.func $sin");
  });
});
