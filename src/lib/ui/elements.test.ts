import { afterEach, describe, expect, it, vi } from "vitest";

const chartState = vi.hoisted(() => ({
  configs: [] as Array<{ data?: { datasets?: unknown[] } }>,
  resizeCount: 0,
}));

vi.mock("chart.js/auto", () => ({
  Chart: class {
    data = { datasets: [] as unknown[], labels: [] as unknown[] };
    options = { scales: {}, plugins: { legend: {} } };
    constructor(_canvas: unknown, config: { data?: { datasets?: unknown[]; labels?: unknown[] } }) {
      chartState.configs.push(config);
      if (config?.data) {
        this.data.datasets = config.data.datasets ?? [];
        this.data.labels = config.data.labels ?? [];
      }
    }
    update(): void {}
    destroy(): void {}
    resize(): void {
      chartState.resizeCount += 1;
    }
  },
}));

import "$lib/ui/app-element";
import { AppState } from "$lib/state";
import { BldApp } from "./app-element";
import { BldBlockIcon } from "./block-icon";
import { BldScopeModal } from "./scope-modal";
import { BldWorkspace } from "./workspace";

function litChangeInUpdateWarnings(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((args: unknown[]) => String(args[0] ?? ""))
    .filter((message: string) => message.includes("scheduled an update"));
}

describe("custom elements", () => {
  it("registers a Lit custom element for each UI surface", () => {
    expect(customElements.get("bld-app")).toBeDefined();
    expect(customElements.get("bld-toolbar")).toBeDefined();
    expect(customElements.get("bld-palette")).toBeDefined();
    expect(customElements.get("bld-block-icon")).toBeDefined();
    expect(customElements.get("bld-workspace")).toBeDefined();
    expect(customElements.get("bld-status-bar")).toBeDefined();
    expect(customElements.get("bld-about-modal")).toBeDefined();
    expect(customElements.get("bld-diagram-io-modal")).toBeDefined();
    expect(customElements.get("bld-scope-modal")).toBeDefined();
    expect(customElements.get("bld-diagram")).toBeDefined();
    expect(customElements.get("bld-node")).toBeDefined();
    expect(customElements.get("bld-connector")).toBeDefined();
  });
});

describe("BldBlockIcon", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders SVG-namespace glyphs for catalog icons", async () => {
    const icon = document.createElement("bld-block-icon") as BldBlockIcon;
    icon.name = "timer.svg";
    document.body.append(icon);
    await icon.updateComplete;
    const svg = icon.shadowRoot?.querySelector("svg");
    const glyph = icon.shadowRoot?.querySelector("path, circle, rect, ellipse");
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(glyph).not.toBeNull();
    expect(glyph!.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });
});

describe("Lit update scheduling", () => {
  afterEach(() => {
    document.body.replaceChildren();
    chartState.configs = [];
    chartState.resizeCount = 0;
    vi.restoreAllMocks();
  });

  it("does not schedule a follow-up update from bld-workspace on first paint", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = document.createElement("bld-app") as BldApp;
    document.body.append(app);
    await app.updateComplete;
    const workspace = app.shadowRoot?.querySelector("bld-workspace") as BldWorkspace;
    await workspace.updateComplete;
    const diagram = workspace.shadowRoot?.querySelector("bld-diagram");
    await (diagram as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
    await app.updateComplete;
    expect(litChangeInUpdateWarnings(warn)).toEqual([]);
  });

  it("does not schedule a follow-up update from bld-scope-modal when opening and closing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chart = document.createElement("bld-scope-modal") as BldScopeModal;
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("scope", 0, 0);
    vi.spyOn(app, "snapshotScope").mockReturnValue([
      { label: "sin", samples: [0, 1] },
      { label: "cos", samples: [1, 0] },
    ]);
    chart.app = app;
    document.body.append(chart);
    await chart.updateComplete;

    app.scopeOpen = id;
    await chart.updateComplete;
    const host = chart.renderRoot.querySelector("[data-testid=scope-chart]");
    const close = chart.renderRoot.querySelector("[data-testid=scope-close]");
    expect(chart.hasAttribute("open")).toBe(true);
    expect(chart.renderRoot.querySelector(".modal-title")).toBeNull();
    expect(close).not.toBeNull();
    expect(close?.getAttribute("aria-label")).toBe("Close");
    expect(host?.getAttribute("data-series-count")).toBe("2");
    expect(chartState.configs[0]?.data?.datasets).toHaveLength(2);
    expect(chartState.resizeCount).toBeGreaterThan(0);

    (close as HTMLButtonElement).click();
    await chart.updateComplete;
    expect(app.scopeOpen).toBe(-1);

    app.scopeOpen = -1;
    await chart.updateComplete;
    await chart.updateComplete;
    expect(chart.hasAttribute("open")).toBe(false);

    expect(litChangeInUpdateWarnings(warn)).toEqual([]);
  });
});
