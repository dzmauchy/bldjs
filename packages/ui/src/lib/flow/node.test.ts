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
    showGpio: false,
    gpioOn: false,
    gpioPin: 0,
    gpioInteractive: false,
    showInputs: false,
    inputsEnabled: true,
    inputs: [
      { name: "elems", typeLabel: "f64", vararg: true, grounded: true, compatible: true },
    ],
    outputs: [{ name: "result", typeLabel: "Array[Double]", vararg: false }],
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
    expect(shadow!.querySelector(".flow-node-title")?.textContent).toBe("array");
    expect(shadow!.querySelectorAll("[data-port]")).toHaveLength(2);
    expect(shadow!.querySelector(".flow-node")?.getAttribute("title")).toBe("array");
    expect(shadow!.querySelector('[data-vector="elems"] .block-port-name')).toBeNull();
    expect(shadow!.querySelector('[data-testid="output-result"] .block-port-name')).toBeNull();
    expect(shadow!.querySelector('[data-testid="output-result"] .block-port-type')).toBeNull();
    expect(shadow!.querySelector('[data-testid="input-elems"] .block-port-type')).toBeNull();
    expect(shadow!.querySelector('[data-testid="output-result-type"]')).toBeNull();
    expect(shadow!.querySelector('[data-testid="input-elems-type"]')).toBeNull();
    expect(shadow!.querySelector('[data-vector="elems"] .block-port-vector-rail')).not.toBeNull();
    expect(shadow!.querySelector('[data-testid="output-result"]')?.getAttribute("title")).toBe("Array[Double]");
    expect(shadow!.querySelector('[data-testid="input-elems"]')?.getAttribute("title")).toBe("f64");
    expect(shadow!.querySelector(".flow-node-params")?.textContent).toContain("T = f64");
    expect(node.dataset.blockDef).toBe("b_array_of");
    expect(shadow!.querySelector(".flow-node-icon")).not.toBeNull();
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
        defId: "scope",
        name: "Scope",
        showChart: true,
        chartEnabled: true,
        selected: true,
        inputs: [],
        outputs: [{ name: "out", typeLabel: "(Double) -> Unit", vararg: false, vectorized: true }],
        paramsLine: "",
      }),
    );
    expect(node.hasAttribute("data-selected")).toBe(true);
    expect(node.shadowRoot!.querySelector(".flow-node-title")?.textContent).toBe("Scope");
    const selectedCss = (Array.isArray(BldNode.styles) ? BldNode.styles : [BldNode.styles])
      .flat(Infinity)
      .map((sheet) => (sheet as { cssText: string }).cssText)
      .join("\n");
    expect(selectedCss).toContain("node-selected-fade");
    expect(selectedCss).toContain("#14191e");
    expect(selectedCss).not.toMatch(/:host\(\[data-selected\]\)[^{]*\{[^}]*border-color/);
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
        defId: "scope",
        name: "Scope",
        showChart: true,
        chartEnabled: false,
        inputs: [],
        outputs: [{ name: "out", typeLabel: "(Double) -> Unit", vararg: false, vectorized: true }],
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
    expect(node.shadowRoot!.querySelector('[data-vector="out"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelector(".flow-node")?.getAttribute("title")).toBe("Scope");
    expect(node.shadowRoot!.querySelector(".flow-node-title")?.textContent).toBe("Scope");
    expect(node.shadowRoot!.querySelector('[data-testid="output-out"]')?.getAttribute("title")).toBe("(Double) -> Unit");
  });

  it("renders extra slotted ports with distinct handles", async () => {
    const node = await mountNode(
      sampleState({
        defId: "scope",
        name: "Scope",
        inputs: [],
        outputs: [
          { name: "out", typeLabel: "(Double) -> Unit", vararg: false, grounded: true, vectorized: true },
          { name: "out[1]", typeLabel: "(Double) -> Unit", vararg: false, grounded: true },
        ],
        paramsLine: "",
      }),
    );
    expect(node.shadowRoot!.querySelector('[data-vector="out"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="output-out"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="output-out[1]"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelectorAll("[data-port][data-side='out']")).toHaveLength(2);
    expect(node.shadowRoot!.querySelectorAll('[data-vector="out"] .block-port-vector-rail')).toHaveLength(1);
    expect(node.shadowRoot!.querySelectorAll('[data-vector="out"] [data-handle]')).toHaveLength(2);
    expect(node.shadowRoot!.querySelector('[data-testid="output-out"]')?.getAttribute("title")).toBe("(Double) -> Unit");
    expect(node.shadowRoot!.querySelector('[data-testid="output-out[1]"]')?.getAttribute("title")).toBe("(Double) -> Unit");
  });

  it("renders a second extra input handle", async () => {
    const node = await mountNode(
      sampleState({
        defId: "timer",
        name: "Timer",
        inputs: [
          { name: "in", typeLabel: "(Double) -> Unit", vararg: false, grounded: true },
          { name: "in[1]", typeLabel: "(Double) -> Unit", vararg: false, grounded: true },
        ],
        outputs: [],
        paramsLine: "",
      }),
    );
    expect(node.shadowRoot!.querySelector('[data-vector="in"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="input-in"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="input-in[1]"] .block-port-name')).toBeNull();
    expect(node.shadowRoot!.querySelectorAll("[data-port][data-side='in']")).toHaveLength(2);
    expect(node.shadowRoot!.querySelectorAll('[data-vector="in"] [data-handle]')).toHaveLength(2);
  });

  it("prints the type under a port only when showType is set", async () => {
    const node = await mountNode(
      sampleState({
        outputs: [{ name: "result", typeLabel: "Array[Double]", vararg: false, showType: true }],
        inputs: [{ name: "elems", typeLabel: "f64", vararg: true, showType: true }],
      }),
    );
    expect(node.shadowRoot!.querySelector('[data-testid="output-result-type"]')?.textContent).toBe("Array[Double]");
    expect(node.shadowRoot!.querySelector('[data-testid="input-elems-type"]')?.textContent).toBe("f64");
    expect(node.shadowRoot!.querySelector('[data-testid="output-result"]')?.classList.contains("is-typed")).toBe(true);
    expect(node.shadowRoot!.querySelector('[data-vector="elems"] .block-port-type')?.textContent).toBe("f64");
    expect(node.shadowRoot!.querySelector(".block-port-meta .block-port-type")).toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="output-result"] .block-port-anchor .block-port-type')).not.toBeNull();
    expect(node.shadowRoot!.querySelector('[data-testid="input-elems"] .block-port-anchor .block-port-type')).not.toBeNull();
  });

  it("shows in/out names only when a side has more than one catalog port", async () => {
    const node = await mountNode(
      sampleState({
        name: "array.get",
        inputs: [
          { name: "array", typeLabel: "Array[Double]", vararg: false },
          { name: "index", typeLabel: "i32", vararg: false },
        ],
        outputs: [
          { name: "true", typeLabel: "f64", vararg: false },
          { name: "false", typeLabel: "f64", vararg: false },
        ],
        paramsLine: "",
      }),
    );
    expect(node.shadowRoot!.querySelector('[data-testid="input-array"] .block-port-name')?.textContent).toBe("array");
    expect(node.shadowRoot!.querySelector('[data-testid="input-index"] .block-port-name')?.textContent).toBe("index");
    expect(node.shadowRoot!.querySelector('[data-testid="output-true"] .block-port-name')?.textContent).toBe("true");
    expect(node.shadowRoot!.querySelector('[data-testid="output-false"] .block-port-name')?.textContent).toBe("false");
    expect(node.shadowRoot!.querySelector(".flow-node-title")?.textContent).toBe("array.get");
    expect(node.shadowRoot!.querySelector(".flow-node")?.getAttribute("title")).toBe("array.get");
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

  it("shows a config button that emits inputsclick", async () => {
    const node = await mountNode(
      sampleState({
        defId: "timer",
        name: "Timer",
        showInputs: true,
        inputs: [{ name: "in", typeLabel: "(Double) -> Unit", vararg: false, grounded: true }],
        outputs: [],
        paramsLine: "",
      }),
    );
    const button = node.shadowRoot!.querySelector('[data-testid="inputs-7"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute("title")).toBe("Configure inputs");
    expect(button.disabled).toBe(false);
    let opened = false;
    node.addEventListener("inputsclick", () => {
      opened = true;
    });
    button.click();
    expect(opened).toBe(true);
  });

  it("does not emit inputsclick when configuration is disabled", async () => {
    const node = await mountNode(
      sampleState({
        defId: "timer",
        name: "Timer",
        showInputs: true,
        inputsEnabled: false,
        inputs: [{ name: "in", typeLabel: "(Double) -> Unit", vararg: false, grounded: true }],
        outputs: [],
        paramsLine: "",
      }),
    );
    const button = node.shadowRoot!.querySelector('[data-testid="inputs-7"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Stop the run to configure inputs");
    let opened = false;
    node.addEventListener("inputsclick", () => {
      opened = true;
    });
    button.click();
    expect(opened).toBe(false);
  });

  it("hides the config button when the block has no inputs", async () => {
    const node = await mountNode(
      sampleState({
        defId: "scope",
        name: "Scope",
        showInputs: false,
        inputs: [],
        outputs: [{ name: "out", typeLabel: "(Double) -> Unit", vararg: false, vectorized: true }],
        paramsLine: "",
      }),
    );
    expect(node.shadowRoot!.querySelector(".flow-node-config")).toBeNull();
  });

  it("shows a GPIO switch that emits gpioclick", async () => {
    const node = await mountNode(
      sampleState({
        defId: "gpio_in",
        name: "GPIO In",
        showGpio: true,
        gpioInteractive: true,
        gpioOn: false,
        gpioPin: 0,
        inputs: [{ name: "in", typeLabel: "(Double) -> Unit", vararg: false, grounded: true }],
        outputs: [],
        paramsLine: "",
      }),
    );
    const toggle = node.shadowRoot!.querySelector('[data-testid="gpio-7"]') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.type).toBe("checkbox");
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.disabled).toBe(false);
    expect(toggle.checked).toBe(false);
    expect(node.shadowRoot!.querySelector(".form-check.form-switch .form-check-label")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "P0 LOW",
    );
    let toggled = false;
    node.addEventListener("gpioclick", () => {
      toggled = true;
    });
    toggle.click();
    expect(toggled).toBe(true);
    node.view = {
      ...node.view!,
      gpioOn: true,
    };
    await node.updateComplete;
    expect(node.hasAttribute("data-gpio-on")).toBe(true);
    expect((node.shadowRoot!.querySelector('[data-testid="gpio-7"]') as HTMLInputElement).checked).toBe(true);
    expect(node.shadowRoot!.querySelector(".form-check-label")?.textContent?.replace(/\s+/g, " ").trim()).toBe("P0 HIGH");
  });

  it("shows a disabled GPIO switch for outputs", async () => {
    const node = await mountNode(
      sampleState({
        defId: "gpio_out",
        name: "GPIO Out",
        showGpio: true,
        gpioInteractive: false,
        gpioOn: true,
        gpioPin: 1,
        inputs: [],
        outputs: [{ name: "out", typeLabel: "(Double) -> Unit", vararg: false }],
        paramsLine: "",
      }),
    );
    const toggle = node.shadowRoot!.querySelector('[data-testid="gpio-7"]') as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(node.shadowRoot!.querySelector(".form-check.form-switch")).not.toBeNull();
    expect(node.shadowRoot!.querySelector(".form-check-label")?.textContent?.replace(/\s+/g, " ").trim()).toBe("P1 HIGH");
    let toggled = false;
    node.addEventListener("gpioclick", () => {
      toggled = true;
    });
    toggle.click();
    expect(toggled).toBe(false);
    expect(toggle.checked).toBe(true);
  });
});
