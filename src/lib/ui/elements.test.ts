import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("chart.js/auto", () => ({
  Chart: class {
    data = { datasets: [] as unknown[], labels: [] as unknown[] };
    options = { scales: {}, plugins: { legend: {} } };
    update(): void {}
    destroy(): void {}
  },
}));

import "$lib/ui/app-element";
import { AppState } from "$lib/state";
import { BldApp } from "./app-element";
import { BldBlockIcon } from "./block-icon";
import { BldOscilloscopeChart } from "./oscilloscope-chart";
import { BldWorkspace } from "./workspace";

function litChangeInUpdateWarnings(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((args) => String(args[0] ?? ""))
    .filter((message) => message.includes("scheduled an update"));
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
    expect(customElements.get("bld-oscilloscope-chart")).toBeDefined();
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

  it("does not schedule a follow-up update from bld-oscilloscope-chart when opening and closing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chart = document.createElement("bld-oscilloscope-chart") as BldOscilloscopeChart;
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("oscilloscope", 0, 0);
    vi.spyOn(app, "snapshotScope").mockResolvedValue([
      { label: "sin", samples: [0, 1] },
      { label: "cos", samples: [1, 0] },
    ]);
    chart.app = app;
    document.body.append(chart);
    await chart.updateComplete;

    app.scopeOpen = id;
    await chart.updateComplete;
    await vi.waitFor(() => {
      const host = chart.renderRoot.querySelector("[data-testid=oscilloscope-chart]");
      expect(host?.getAttribute("data-series-count")).toBe("2");
    });

    app.scopeOpen = -1;
    await chart.updateComplete;
    await chart.updateComplete;

    expect(litChangeInUpdateWarnings(warn)).toEqual([]);
  });
});
