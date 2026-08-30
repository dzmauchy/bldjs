import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { portFromComposedPath } from "./layout";
import { BldNode } from "./node";
import type { BldNodeState } from "./types";
import "./node";

function sampleState(overrides: Partial<BldNodeState> = {}): BldNodeState {
  return {
    blockId: 7,
    defId: "b_array_of",
    name: "array",
    icon: "list",
    kindClass: "block-kind-process",
    selected: false,
    paramsLine: "T = f64",
    showChart: false,
    chartEnabled: false,
    inputs: [
      { name: "elems", typeLabel: "f64", vararg: true, grounded: true, compatible: true },
    ],
    outputs: [{ name: "result", typeLabel: "f64[]", vararg: false }],
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
    expect(shadow!.querySelector(".flow-node-title")).toBeNull();
    expect(shadow!.querySelectorAll("[data-port]")).toHaveLength(2);
    expect(shadow!.querySelector('[data-vector="elems"] .block-port-name')?.textContent).toBe("elems…");
    expect(shadow!.querySelector('[data-testid="output-result"] .block-port-name')?.textContent).toBe("result");
    expect(shadow!.querySelector('[data-testid="output-result"] .block-port-name')?.textContent).not.toContain("f64[]");
    expect(shadow!.querySelector('[data-testid="output-result"] .block-port-type')).toBeNull();
    expect(shadow!.querySelector('[data-testid="input-elems"] .block-port-type')).toBeNull();
    expect(shadow!.querySelector('[data-testid="output-result-type"]')).toBeNull();
    expect(shadow!.querySelector('[data-testid="input-elems-type"]')).toBeNull();
    expect(shadow!.querySelector('[data-vector="elems"] .block-port-vector-rail')).not.toBeNull();
    expect(shadow!.querySelector('[data-testid="output-result"]')?.getAttribute("title")).toBe("f64[]");
    expect(shadow!.querySelector('[data-testid="input-elems"]')?.getAttribute("title")).toBe("f64");
    expect(shadow!.querySelector(".flow-node-params")?.textContent).toContain("T = f64");
    expect(node.dataset.blockDef).toBe("b_array_of");
    const icon = shadow!.querySelector(".flow-node-icon") as HTMLElement;
    expect(icon).not.toBeNull();
    expect(getComputedStyle(icon).width).toBe("32px");
    expect(getComputedStyle(icon).height).toBe("32px");
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
    const handle = node.shadowRoot!.querySelector('[data-testid="input-elems"]')!;
    const event = new PointerEvent("pointerup", { bubbles: true, composed: true });
    Object.defineProperty(event, "composedPath", {
      value: () => [handle, node.shadowRoot, node, document.body],
    });
    expect(portFromComposedPath(event)).toEqual({ host: node, side: "in", port: "elems" });
  });

  it("toggles selected and chart chrome from state", async () => {
    const node = await mountNode(
      sampleState({
        defId: "oscilloscope",
        name: "Oscilloscope",
        showChart: true,
        chartEnabled: true,
        selected: true,
        inputs: [],
        outputs: [{ name: "out", typeLabel: "c<f64>[]", vararg: false, vectorized: true }],
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
        inputs: [],
        outputs: [{ name: "out", typeLabel: "c<f64>[]", vararg: false, vectorized: true }],
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
    expect(node.shadowRoot!.querySelector('[data-testid="output-out-type"]')).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="output-out"] .block-port-type')).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-vector="out"] .block-port-name')?.textContent).toBe("out");
    expect(node.shadowRoot!.querySelector('[data-testid="output-out"]')?.getAttribute("title")).toBe("c<f64>[]");
  });

  it("renders extra slotted ports with distinct handles", async () => {
    const node = await mountNode(
      sampleState({
        defId: "oscilloscope",
        name: "Oscilloscope",
        inputs: [],
        outputs: [
          { name: "out", typeLabel: "c<f64>[]", vararg: false, grounded: true, vectorized: true },
          { name: "out[1]", typeLabel: "c<f64>", vararg: false, grounded: true },
        ],
        paramsLine: "",
      }),
    );
    expect(node.shadowRoot!.querySelector('[data-vector="out"] .block-port-name')?.textContent).toBe("out");
    expect(node.shadowRoot!.querySelector('[data-testid="output-out"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="output-out[1]"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelectorAll("[data-port][data-side='out']")).toHaveLength(2);
    expect(node.shadowRoot!.querySelectorAll('[data-vector="out"] .block-port-vector-rail')).toHaveLength(1);
    expect(node.shadowRoot!.querySelectorAll('[data-vector="out"] [data-handle]')).toHaveLength(2);
  });

  it("renders a second extra input handle", async () => {
    const node = await mountNode(
      sampleState({
        defId: "timer",
        name: "Timer",
        inputs: [
          { name: "in", typeLabel: "c<f64>", vararg: false, grounded: true },
          { name: "in[1]", typeLabel: "c<f64>", vararg: false, grounded: true },
        ],
        outputs: [],
        paramsLine: "",
      }),
    );
    expect(node.shadowRoot!.querySelector('[data-vector="in"] .block-port-name')?.textContent).toBe("in");
    expect(node.shadowRoot!.querySelector('[data-testid="input-in"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="input-in[1]"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelectorAll("[data-port][data-side='in']")).toHaveLength(2);
    expect(node.shadowRoot!.querySelectorAll('[data-vector="in"] [data-handle]')).toHaveLength(2);
  });

  it("prints the type under a port only when showType is set", async () => {
    const node = await mountNode(
      sampleState({
        outputs: [{ name: "result", typeLabel: "f64[]", vararg: false, showType: true }],
        inputs: [{ name: "elems", typeLabel: "f64", vararg: true, showType: true }],
      }),
    );
    expect(node.shadowRoot!.querySelector('[data-testid="output-result-type"]')?.textContent).toBe("f64[]");
    expect(node.shadowRoot!.querySelector('[data-testid="input-elems-type"]')?.textContent).toBe("f64");
    expect(node.shadowRoot!.querySelector('[data-testid="output-result"]')?.classList.contains("is-typed")).toBe(true);
    expect(node.shadowRoot!.querySelector('[data-vector="elems"] .block-port-type')?.textContent).toBe("f64");
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
