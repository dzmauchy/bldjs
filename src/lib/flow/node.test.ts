import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BldNode, registerFlowElements, type BldNodeState } from "./index";

function sampleState(overrides: Partial<BldNodeState> = {}): BldNodeState {
  return {
    blockId: 7,
    defId: "b_map_of",
    name: "Map.of",
    icon: "map",
    kindClass: "block-kind-process",
    selected: false,
    paramsLine: "K = String · V = Integer",
    showChart: false,
    inputs: [
      { name: "key", typeLabel: "String", vararg: false, grounded: true, compatible: true },
      { name: "val", typeLabel: "Integer", vararg: false, grounded: false, compatible: true },
    ],
    outputs: [{ name: "result", typeLabel: "Map<String, Integer>", vararg: false }],
    ...overrides,
  };
}

describe("BldNode", () => {
  beforeAll(() => {
    registerFlowElements();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders flex columns so port count drives layout", () => {
    const node = document.createElement("bld-node");
    node.state = sampleState();
    document.body.append(node);

    const shadow = node.shadowRoot;
    expect(shadow).not.toBeNull();
    expect(shadow!.querySelector(".flow-node")).not.toBeNull();
    expect(shadow!.querySelector(".flow-node-ports")).not.toBeNull();
    expect(shadow!.querySelectorAll("[data-port]")).toHaveLength(3);
    expect(shadow!.querySelector('[data-testid="input-key"]')?.textContent).toContain("key");
    expect(shadow!.querySelector('[data-testid="output-result"]')?.textContent).toContain("Map<String, Integer>");
    expect(shadow!.querySelector(".flow-node-params")?.textContent).toContain("K = String");
    expect(node.dataset.blockDef).toBe("b_map_of");
  });

  it("emits composed port events from handles inside the shadow tree", () => {
    const node = document.createElement("bld-node");
    node.state = sampleState();
    document.body.append(node);

    let detail: unknown;
    node.addEventListener("portpointerdown", (event) => {
      detail = (event as CustomEvent).detail;
    });
    const handle = node.shadowRoot!.querySelector('[data-testid="output-result"]')!;
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, clientX: 4, clientY: 8 }));
    expect(detail).toMatchObject({ blockId: 7, port: "result", side: "out", clientX: 4, clientY: 8 });
  });

  it("resolves a port from the composed path", () => {
    const node = document.createElement("bld-node");
    node.state = sampleState();
    document.body.append(node);
    const handle = node.shadowRoot!.querySelector('[data-testid="input-val"]')!;
    const event = new PointerEvent("pointerup", { bubbles: true, composed: true });
    Object.defineProperty(event, "composedPath", {
      value: () => [handle, node.shadowRoot, node, document.body],
    });
    expect(BldNode.fromComposedPath(event)).toEqual({ node, side: "in", port: "val" });
  });

  it("toggles selected and chart chrome from state", () => {
    const node = document.createElement("bld-node");
    node.state = sampleState({
      defId: "oscilloscope",
      name: "Oscilloscope",
      showChart: true,
      selected: true,
      inputs: [{ name: "in", typeLabel: "double", vararg: false }],
      outputs: [],
      paramsLine: "",
    });
    document.body.append(node);
    expect(node.hasAttribute("data-selected")).toBe(true);
    const chart = node.shadowRoot!.querySelector('[data-testid="chart-7"]') as HTMLButtonElement;
    expect(chart.hidden).toBe(false);
    let opened = false;
    node.addEventListener("chartclick", () => {
      opened = true;
    });
    chart.click();
    expect(opened).toBe(true);
  });
});
