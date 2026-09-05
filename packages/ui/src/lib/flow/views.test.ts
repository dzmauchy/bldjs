import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Diagram, infer, type Link } from "@bld/xml/blocks/diagram";
import type { BlockInstance } from "$lib/diagram-model";
import { blockKindFromName } from "$lib/model";
import { buildConnectorViews, buildNodeState } from "./views";
import type { NodeLayout } from "./types";

function layout(): NodeLayout {
  return {
    width: 100,
    height: 40,
    ports: {
      in: { in: { x: 0, y: 20 } },
      out: { out: { x: 100, y: 20 } },
    },
  };
}

describe("buildConnectorViews", () => {
  it("builds endpoints from indexed blocks and reports earlier wires as underlays", () => {
    const blocks = new Map<number, BlockInstance>([
      [1, { id: 1, defId: "scope", x: 0, y: 0 }],
      [2, { id: 2, defId: "timer", x: 200, y: 0 }],
      [3, { id: 3, defId: "sin", x: 0, y: 80 }],
      [4, { id: 4, defId: "timer", x: 200, y: 80 }],
    ]);
    const layouts = new Map<number, NodeLayout>([
      [1, layout()],
      [2, layout()],
      [3, layout()],
      [4, layout()],
    ]);
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    const views = buildConnectorViews(
      links,
      (id) => blocks.get(id),
      layouts,
      new Map(),
      (link) => link.fromBlock === 3,
    );
    expect(views).toHaveLength(2);
    expect(views[0]?.from).toEqual({ x: 100, y: 20 });
    expect(views[0]?.to).toEqual({ x: 200, y: 20 });
    expect(views[0]?.crossings).toEqual([]);
    expect(views[1]?.selected).toBe(true);
    expect(views[1]?.crossings).toEqual([
      { from: views[0]!.from, to: views[0]!.to, route: [] },
    ]);
  });
});

describe("buildNodeState", () => {
  it("labels every expanded scope channel as (Double) -> Unit", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const catalog = diagram.catalog();
    const block: BlockInstance = { id: 1, defId: "scope", x: 0, y: 0 };
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
    ];
    const resolved = infer(catalog, [[1, "scope"] as const], links);
    const state = buildNodeState(block, resolved, {
      catalog,
      links,
      selected: -1,
      linkingFrom: { blockId: 1, port: "out" },
      isScopeLive: () => false,
      gpioOn: () => false,
      gpioPin: () => 0,
      inputsEnabled: true,
      inputIsGrounded: () => false,
      blockDef: (defId) => catalog.block(defId),
      kindOf: () => blockKindFromName("Output")!,
    });
    expect(state?.name).toBe("Scope");
    expect(state?.outputs.map((port) => ({ name: port.name, typeLabel: port.typeLabel, showType: port.showType }))).toEqual([
      { name: "out", typeLabel: "(Double) -> Unit", showType: true },
      { name: "out[1]", typeLabel: "(Double) -> Unit", showType: false },
    ]);
    expect(state?.showInputs).toBe(true);
    expect(catalog.block("scope")?.parameters.map((param) => param.name)).toEqual(["n", "m"]);
  });

  it("shows the config control on generators with a period parameter", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const catalog = diagram.catalog();
    const block: BlockInstance = { id: 2, defId: "timer", x: 0, y: 0 };
    const state = buildNodeState(block, new Map(), {
      catalog,
      links: [],
      selected: -1,
      linkingFrom: null,
      isScopeLive: () => false,
      gpioOn: () => false,
      gpioPin: () => 0,
      inputsEnabled: true,
      inputIsGrounded: () => false,
      blockDef: (defId) => catalog.block(defId),
      kindOf: () => blockKindFromName("Start")!,
    });
    expect(state?.showInputs).toBe(true);
    expect(catalog.block("timer")?.parameters.map((param) => param.name)).toEqual(["period"]);
  });

  it("shows the config control on overshoot with ζ and ω parameters", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const catalog = diagram.catalog();
    const block: BlockInstance = { id: 2, defId: "overshoot", x: 0, y: 0 };
    const state = buildNodeState(block, new Map(), {
      catalog,
      links: [],
      selected: -1,
      linkingFrom: null,
      isScopeLive: () => false,
      gpioOn: () => false,
      gpioPin: () => 0,
      inputsEnabled: true,
      inputIsGrounded: () => false,
      blockDef: (defId) => catalog.block(defId),
      kindOf: () => blockKindFromName("Process")!,
    });
    expect(state?.showInputs).toBe(true);
    expect(catalog.block("overshoot")?.parameters.map((param) => param.name)).toEqual(["ζ", "ω"]);
  });

  it("shows n product outputs from the count setting", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const catalog = diagram.catalog();
    const block: BlockInstance = { id: 2, defId: "product", x: 0, y: 0 };
    const state = buildNodeState(block, new Map(), {
      catalog,
      links: [],
      selected: -1,
      linkingFrom: null,
      isScopeLive: () => false,
      gpioOn: () => false,
      gpioPin: () => 0,
      inputsEnabled: true,
      inputIsGrounded: () => false,
      blockDef: (defId) => catalog.block(defId),
      kindOf: () => blockKindFromName("Process")!,
      outputCount: () => 2,
    });
    expect(state?.showInputs).toBe(true);
    expect(state?.outputs.map((port) => port.name)).toEqual(["out", "out[1]"]);
    expect(catalog.block("product")?.parameters.map((param) => param.name)).toEqual(["n", "def"]);
  });

  it("marks GPIO In as an interactive switch and GPIO Out as a disabled readout", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const catalog = diagram.catalog();
    const ctx = {
      catalog,
      links: [] as Link[],
      selected: -1,
      linkingFrom: null,
      isScopeLive: () => false,
      gpioOn: () => false,
      gpioPin: () => 0,
      inputsEnabled: true,
      inputIsGrounded: () => false,
      blockDef: (defId: string) => catalog.block(defId),
      kindOf: () => blockKindFromName("Start")!,
    };
    const input = buildNodeState({ id: 3, defId: "gpio_in", x: 0, y: 0 }, new Map(), ctx);
    const output = buildNodeState({ id: 4, defId: "gpio_out", x: 0, y: 80 }, new Map(), {
      ...ctx,
      kindOf: () => blockKindFromName("Output")!,
    });
    expect(input?.showGpio).toBe(true);
    expect(input?.gpioInteractive).toBe(true);
    expect(input?.showInputs).toBe(true);
    expect(output?.showGpio).toBe(true);
    expect(output?.gpioInteractive).toBe(false);
    expect(output?.showInputs).toBe(true);
  });

  it("disables configuration when the run is busy", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const catalog = diagram.catalog();
    const state = buildNodeState(
      { id: 2, defId: "timer", x: 0, y: 0 },
      new Map(),
      {
        catalog,
        links: [],
        selected: -1,
        linkingFrom: null,
        isScopeLive: () => false,
        gpioOn: () => false,
        gpioPin: () => 0,
        inputsEnabled: false,
        inputIsGrounded: () => false,
        blockDef: (defId) => catalog.block(defId),
        kindOf: () => blockKindFromName("Start")!,
      },
    );
    expect(state?.showInputs).toBe(true);
    expect(state?.inputsEnabled).toBe(false);
  });
});
