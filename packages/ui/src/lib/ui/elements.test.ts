import { afterEach, describe, expect, it, vi } from "vitest";

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

function stubScopeCanvas(): { fillRect: ReturnType<typeof vi.fn> } {
  const fillRect = vi.fn();
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "",
    lineCap: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setTransform: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 280,
  });
  return { fillRect };
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
    expect(customElements.get("bld-inputs-modal")).toBeDefined();
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
    delete (HTMLCanvasElement.prototype as { clientWidth?: number }).clientWidth;
    delete (HTMLCanvasElement.prototype as { clientHeight?: number }).clientHeight;
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
    const { fillRect } = stubScopeCanvas();
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
    const caption = chart.renderRoot.querySelector("[data-testid=scope-caption]");
    const canvas = host?.querySelector("canvas");
    expect(chart.hasAttribute("open")).toBe(true);
    expect(chart.renderRoot.querySelector(".modal-title")).toBeNull();
    expect(host?.querySelector("[data-testid=scope-close]")).toBeNull();
    expect(close).not.toBeNull();
    expect(close?.closest(".scope-footer")).not.toBeNull();
    expect(close?.getAttribute("aria-label")).toBe("Close");
    expect(caption?.textContent?.trim()).toBe(`blk_${id}`);
    expect(caption?.textContent).not.toContain("timer(");
    expect(host?.getAttribute("data-series-count")).toBe("2");
    expect(host?.getAttribute("data-sample-count")).toBe("2");
    expect(host?.getAttribute("data-painted")).toBe("true");
    expect(canvas).not.toBeNull();
    expect(fillRect).toHaveBeenCalled();

    (close as HTMLButtonElement).click();
    await chart.updateComplete;
    expect(app.scopeOpen).toBe(-1);

    app.scopeOpen = -1;
    await chart.updateComplete;
    await chart.updateComplete;
    expect(chart.hasAttribute("open")).toBe(false);

    expect(litChangeInUpdateWarnings(warn)).toEqual([]);
  });

  it("labels the scope footer with the instance name when one exists", async () => {
    stubScopeCanvas();
    const chart = document.createElement("bld-scope-modal") as BldScopeModal;
    const app = new AppState();
    expect(
      app.loadDiagramXml(`<?xml version="1.0" encoding="UTF-8"?>
<diagram id="diag_named" name="Named" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z">
  <catalogs>
    <catalog>types.xml</catalog>
    <catalog>control-systems.xml</catalog>
  </catalogs>
  <blocks>
    <block id="blk_probe" type="scope" name="Probe" x="0" y="0" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z"/>
  </blocks>
</diagram>`),
    ).toBe(true);
    const id = app.blocks[0]!.id;
    vi.spyOn(app, "snapshotScope").mockReturnValue([{ label: "sin", samples: [0, 1] }]);
    chart.app = app;
    document.body.append(chart);
    await chart.updateComplete;
    app.scopeOpen = id;
    await chart.updateComplete;
    expect(chart.renderRoot.querySelector("[data-testid=scope-caption]")?.textContent?.trim()).toBe("Probe");
  });
});
