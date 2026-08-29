import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { portFromComposedPath } from "./layout";
import { BldNode } from "./node";
import type { BldNodeState } from "./types";
import "./node";

function sampleState(overrides: Partial<BldNodeState> = {}): BldNodeState {
  return {
    blockId: 7,
    defId: "b_map_of",
    name: "map",
    icon: "map",
    kindClass: "block-kind-process",
    selected: false,
    paramsLine: "K = i32 · V = f64",
    showChart: false,
    chartEnabled: false,
    inputs: [
      { name: "key", typeLabel: "i32", vararg: false, grounded: true, compatible: true },
      { name: "val", typeLabel: "f64", vararg: false, grounded: false, compatible: true },
    ],
    outputs: [{ name: "result", typeLabel: "map<i32, f64>", vararg: false }],
    ...overrides,
  };
}

async function mountNode(state: BldNodeState): Promise<BldNode> {
  const node = document.createElement("bld-node");
  node.view = state;
  node.x = 0;
  node.y = 0;
  document.body.append(node);
  await node.updateComplete;
  return node;
}

describe("BldNode", () => {
  beforeAll(() => {
    expect(customElements.get("bld-node")).toBeDefined();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders flex columns so port count drives layout", async () => {
    const node = await mountNode(sampleState());
    const shadow = node.shadowRoot;
    expect(shadow).not.toBeNull();
    expect(shadow!.querySelector(".flow-node")).not.toBeNull();
    expect(shadow!.querySelector(".flow-node-ports")).not.toBeNull();
    expect(shadow!.querySelectorAll("[data-port]")).toHaveLength(3);
    expect(shadow!.querySelector('[data-testid="input-key"]')?.textContent).toContain("key");
    expect(shadow!.querySelector('[data-testid="output-result"]')?.textContent).toContain("result");
    expect(shadow!.querySelector('[data-testid="output-result"]')?.textContent).not.toContain("map<i32, f64>");
    expect(shadow!.querySelector('[data-testid="output-result"]')?.getAttribute("title")).toBe("map<i32, f64>");
    expect(shadow!.querySelector(".flow-node-params")?.textContent).toContain("K = i32");
    expect(node.dataset.blockDef).toBe("b_map_of");
    const glyph = shadow!.querySelector(".flow-node-icon path, .flow-node-icon rect, .flow-node-icon circle");
    expect(glyph).not.toBeNull();
    expect(glyph!.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  it("emits composed port events from handles inside the shadow tree", async () => {
    const node = await mountNode(sampleState());
    let detail: unknown;
    node.addEventListener("portpointerdown", (event) => {
      detail = (event as CustomEvent).detail;
    });
    const handle = node.shadowRoot!.querySelector('[data-testid="output-result"]')!;
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, clientX: 4, clientY: 8 }));
    expect(detail).toMatchObject({ blockId: 7, port: "result", side: "out", clientX: 4, clientY: 8 });
  });

  it("resolves a port from the composed path", async () => {
    const node = await mountNode(sampleState());
    const handle = node.shadowRoot!.querySelector('[data-testid="input-val"]')!;
    const event = new PointerEvent("pointerup", { bubbles: true, composed: true });
    Object.defineProperty(event, "composedPath", {
      value: () => [handle, node.shadowRoot, node, document.body],
    });
    expect(portFromComposedPath(event)).toEqual({ host: node, side: "in", port: "val" });
  });

  it("toggles selected and chart chrome from state", async () => {
    const node = await mountNode(
      sampleState({
        defId: "oscilloscope",
        name: "Oscilloscope",
        showChart: true,
        chartEnabled: true,
        selected: true,
        inputs: [{ name: "in", typeLabel: "double", vararg: false }],
        outputs: [],
        paramsLine: "",
      }),
    );
    expect(node.hasAttribute("data-selected")).toBe(true);
    const chart = node.shadowRoot!.querySelector('[data-testid="chart-7"]') as HTMLButtonElement;
    expect(chart.hidden).toBe(false);
    let opened = false;
    node.addEventListener("chartclick", () => {
      opened = true;
    });
    expect(chart.disabled).toBe(false);
    chart.click();
    expect(opened).toBe(true);
  });

  it("does not emit chartclick when the chart is disabled", async () => {
    const node = await mountNode(
      sampleState({
        defId: "oscilloscope",
        name: "Oscilloscope",
        showChart: true,
        chartEnabled: false,
        inputs: [{ name: "in", typeLabel: "fn<f64>", vararg: false }],
        outputs: [],
        paramsLine: "",
      }),
    );
    const chart = node.shadowRoot!.querySelector('[data-testid="chart-7"]') as HTMLButtonElement;
    expect(chart.disabled).toBe(true);
    let opened = false;
    node.addEventListener("chartclick", () => {
      opened = true;
    });
    chart.click();
    expect(opened).toBe(false);
  });

  it("reports its measured size through noderesize", async () => {
    const node = document.createElement("bld-node");
    const layouts: unknown[] = [];
    node.addEventListener("noderesize", (event) => {
      layouts.push((event as CustomEvent).detail);
    });
    node.view = sampleState();
    document.body.append(node);
    await node.updateComplete;
    await node.updateComplete;
    expect(layouts.length).toBeGreaterThan(0);
    expect(layouts.at(-1)).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
      ports: { in: expect.any(Object), out: expect.any(Object) },
    });
  });
});
