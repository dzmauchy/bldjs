import { afterEach, describe, expect, it, vi } from "vitest";

import "$lib/ui/app-element";
import { AppState } from "$lib/state";
import { BldApp } from "./app-element";
import { BldBlockIcon } from "./block-icon";
import { BldDiagramIoModal } from "./diagram-io-modal";
import { BldInputsModal } from "./inputs-modal";
import { BldModal } from "./modal";
import { BldScopeModal, clampScopePanelPosition } from "./scope-modal";
import { BldWorkspace } from "./workspace";

function litChangeInUpdateWarnings(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((args: unknown[]) => String(args[0] ?? ""))
    .filter((message: string) => message.includes("scheduled an update"));
}

function flattenedStyles(styles: unknown): unknown[] {
  return Array.isArray(styles) ? styles.flat(Infinity) : [styles];
}

function expectOverlayChrome(styles: unknown): void {
  const inherited = flattenedStyles(BldModal.styles);
  const actual = flattenedStyles(styles);
  for (const style of inherited) {
    expect(actual).toContain(style);
  }
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

describe("modal overlay chrome", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps Bootstrap overlay styles on inputs and save/open subclasses", () => {
    expectOverlayChrome(BldInputsModal.styles);
    expectOverlayChrome(BldDiagramIoModal.styles);
  });

  it("opens generator period configuration as a fixed overlay", async () => {
    const modal = document.createElement("bld-inputs-modal") as BldInputsModal;
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("timer", 0, 0);
    modal.app = app;
    document.body.append(modal);
    await modal.updateComplete;
    expect(modal.renderRoot.querySelector("[data-testid=inputs-modal]")).toBeNull();

    app.openInputs(id);
    await modal.updateComplete;
    const dialog = modal.renderRoot.querySelector("[data-testid=inputs-modal]");
    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains("modal")).toBe(true);
    expect(dialog?.classList.contains("show")).toBe(true);
    expect(dialog?.classList.contains("d-block")).toBe(true);
    expect(modal.renderRoot.querySelector("[data-testid=input-value-period]")?.textContent).toBe("10 ms");
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
    vi.spyOn(app.run, "snapshotScope").mockReturnValue([
      { label: "sin", samples: [0, 1] },
      { label: "cos", samples: [1, 0] },
    ]);
    chart.app = app;
    document.body.append(chart);
    await chart.updateComplete;
    expect(chart.hasAttribute("open")).toBe(false);
    expect(chart.renderRoot.querySelector("[data-testid=scope-modal]")).not.toBeNull();
    expect(chart.renderRoot.querySelector("[data-testid=scope-chart] canvas")).not.toBeNull();
    expect(chart.renderRoot.querySelector("[data-testid=scope-modal]")?.getAttribute("aria-hidden")).toBe("true");
    expect(chart.renderRoot.querySelector(".scope-panel")?.classList.contains("is-closed")).toBe(true);
    expect(chart.renderRoot.querySelector(".modal-backdrop")).toBeNull();

    app.scopeOpen = id;
    await chart.updateComplete;
    const host = chart.renderRoot.querySelector("[data-testid=scope-chart]");
    const close = chart.renderRoot.querySelector("[data-testid=scope-close]");
    const caption = chart.renderRoot.querySelector("[data-testid=scope-caption]");
    const canvas = host?.querySelector("canvas");
    const panel = chart.renderRoot.querySelector("[data-testid=scope-modal]");
    expect(chart.hasAttribute("open")).toBe(true);
    expect(panel?.classList.contains("modal")).toBe(false);
    expect(panel?.getAttribute("role")).toBe("region");
    expect(chart.renderRoot.querySelector(".modal-backdrop")).toBeNull();
    expect(chart.renderRoot.querySelector(".scope-panel")?.classList.contains("is-closed")).toBe(false);
    expect(chart.renderRoot.querySelector(".modal-title")).toBeNull();
    expect(host?.querySelector("[data-testid=scope-close]")).toBeNull();
    expect(close).not.toBeNull();
    expect(close?.closest("[data-testid=scope-footer]")).not.toBeNull();
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
    expect(chart.hasAttribute("open")).toBe(false);
    expect(chart.renderRoot.querySelector("[data-testid=scope-modal]")).not.toBeNull();
    expect(chart.renderRoot.querySelector("[data-testid=scope-chart] canvas")).not.toBeNull();

    app.scopeOpen = -1;
    await chart.updateComplete;
    await chart.updateComplete;
    expect(chart.hasAttribute("open")).toBe(false);

    expect(litChangeInUpdateWarnings(warn)).toEqual([]);
  });

  it("paints on the first open from a pre-mounted canvas", async () => {
    const { fillRect } = stubScopeCanvas();
    const chart = document.createElement("bld-scope-modal") as BldScopeModal;
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("scope", 0, 0);
    vi.spyOn(app.run, "snapshotScope").mockReturnValue([{ label: "sin", samples: [0, 1, 0, -1] }]);
    chart.app = app;
    document.body.append(chart);
    await chart.updateComplete;
    expect(fillRect).toHaveBeenCalled();
    expect(chart.renderRoot.querySelector("[data-testid=scope-chart] canvas")).not.toBeNull();
    const warmed = fillRect.mock.calls.length;

    app.scopeOpen = id;
    await chart.updateComplete;
    expect(chart.hasAttribute("open")).toBe(true);
    expect(chart.renderRoot.querySelector("[data-testid=scope-chart]")?.getAttribute("data-painted")).toBe("true");
    expect(chart.renderRoot.querySelector("[data-testid=scope-chart]")?.getAttribute("data-series-count")).toBe("1");
    expect(fillRect.mock.calls.length).toBeGreaterThan(warmed);
  });

  it("labels the scope footer with the instance name when one exists", async () => {
    stubScopeCanvas();
    const chart = document.createElement("bld-scope-modal") as BldScopeModal;
    const app = new AppState();
    expect(
      app.io.loadXml(`<?xml version="1.0" encoding="UTF-8"?>
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
    vi.spyOn(app.run, "snapshotScope").mockReturnValue([{ label: "sin", samples: [0, 1] }]);
    chart.app = app;
    document.body.append(chart);
    await chart.updateComplete;
    app.scopeOpen = id;
    await chart.updateComplete;
    expect(chart.renderRoot.querySelector("[data-testid=scope-caption]")?.textContent?.trim()).toBe("Probe");
  });

  it("moves the floating scope panel from its status line", async () => {
    stubScopeCanvas();
    const chart = document.createElement("bld-scope-modal") as BldScopeModal;
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("scope", 0, 0);
    vi.spyOn(app.run, "snapshotScope").mockReturnValue([{ label: "sin", samples: [0, 1] }]);
    chart.app = app;
    document.body.append(chart);
    await chart.updateComplete;
    app.scopeOpen = id;
    await chart.updateComplete;
    const panel = chart.renderRoot.querySelector("[data-testid=scope-modal]") as HTMLElement;
    const footer = chart.renderRoot.querySelector("[data-testid=scope-footer]") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(footer).not.toBeNull();
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 80,
      left: 100,
      top: 80,
      width: 640,
      height: 320,
      right: 740,
      bottom: 400,
      toJSON: () => ({}),
    });
    Object.defineProperty(panel, "offsetWidth", { configurable: true, value: 640 });
    Object.defineProperty(panel, "offsetHeight", { configurable: true, value: 320 });
    footer.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        composed: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: 180,
        clientY: 380,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: -1,
        buttons: 1,
        clientX: 260,
        clientY: 330,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: 260,
        clientY: 330,
      }),
    );
    expect(panel.style.left).toBe("180px");
    expect(panel.style.top).toBe("30px");
    expect(panel.classList.contains("is-placed")).toBe(true);
    expect(app.scopeOpen).toBe(id);
  });
});

describe("scope panel position", () => {
  it("keeps the floating chart inside the viewport", () => {
    expect(clampScopePanelPosition(-40, -20, 640, 320, 1400, 900)).toEqual({ left: 0, top: 0 });
    expect(clampScopePanelPosition(2000, 800, 640, 320, 1400, 900)).toEqual({ left: 760, top: 580 });
    expect(clampScopePanelPosition(10, 20, 1600, 1000, 1400, 900)).toEqual({ left: 0, top: 0 });
  });
});
