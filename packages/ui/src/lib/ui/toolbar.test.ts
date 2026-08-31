import { afterEach, describe, expect, it } from "vitest";
import { AppState } from "$lib/state";
import { BldToolbar } from "./toolbar";

async function glyph(host: Element | null | undefined): Promise<SVGElement | null> {
  const icon = host?.querySelector("bld-block-icon");
  if (!(icon instanceof HTMLElement) || !icon.shadowRoot) {
    return null;
  }
  await (icon as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
  return icon.shadowRoot.querySelector("svg");
}

describe("BldToolbar", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders a Run toggle with an SVG icon and a three-line menu button", async () => {
    const bar = document.createElement("bld-toolbar") as BldToolbar;
    bar.app = new AppState();
    document.body.append(bar);
    await bar.updateComplete;

    const run = bar.shadowRoot?.querySelector('[data-testid="toolbar-run"]');
    const stop = bar.shadowRoot?.querySelector('[data-testid="toolbar-stop"]');
    const menu = bar.shadowRoot?.querySelector('[data-testid="toolbar-menu"]');
    const brand = bar.shadowRoot?.querySelector('[data-testid="app-brand"] svg');
    expect(brand?.getAttribute("viewBox")).toBe("0 0 512 512");
    expect(brand?.getAttribute("aria-label")).toBe("Bld");
    expect(run?.textContent?.trim()).toBe("");
    expect(stop).toBeNull();
    expect(run?.getAttribute("aria-label")).toBe("Run");
    expect(run?.getAttribute("title")).toBe("Run");
    expect(run?.textContent).not.toContain("Bld");
    expect((run as HTMLButtonElement | null)?.disabled).toBe(false);

    const runSvg = await glyph(run);
    const menuSvg = await glyph(menu);
    expect(runSvg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(runSvg?.querySelector("path")?.getAttribute("d")).toContain("M4 2.5v11L13.5 8Z");
    expect(menuSvg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(menuSvg?.querySelectorAll("path")).toHaveLength(1);
    expect(menuSvg?.querySelector("path")?.getAttribute("d")).toContain("M2.5 4h11");
  });

  it("switches the Run button to Stop while the diagram is busy", async () => {
    const app = new AppState();
    const bar = document.createElement("bld-toolbar") as BldToolbar;
    bar.app = app;
    document.body.append(bar);
    await bar.updateComplete;

    const runBtn = () => bar.shadowRoot?.querySelector('[data-testid="toolbar-run"]') as HTMLButtonElement | null;
    const stopBtn = () => bar.shadowRoot?.querySelector('[data-testid="toolbar-stop"]') as HTMLButtonElement | null;
    expect(runBtn()).not.toBeNull();
    expect(stopBtn()).toBeNull();
    expect((await glyph(runBtn()))?.querySelector("path")?.getAttribute("d")).toContain("M4 2.5v11L13.5 8Z");

    app.starting = true;
    await bar.updateComplete;
    expect(runBtn()).toBeNull();
    expect(stopBtn()?.getAttribute("aria-label")).toBe("Stop");
    expect(stopBtn()?.getAttribute("title")).toBe("Stop");
    expect(stopBtn()?.disabled).toBe(false);
    expect((await glyph(stopBtn()))?.querySelector("rect")).not.toBeNull();

    app.starting = false;
    app.running = true;
    await bar.updateComplete;
    expect(runBtn()).toBeNull();
    expect(stopBtn()?.getAttribute("aria-label")).toBe("Stop");
    expect((await glyph(stopBtn()))?.querySelector("rect")).not.toBeNull();

    app.running = false;
    await bar.updateComplete;
    expect(stopBtn()).toBeNull();
    expect(runBtn()?.getAttribute("aria-label")).toBe("Run");
    expect((await glyph(runBtn()))?.querySelector("path")?.getAttribute("d")).toContain("M4 2.5v11L13.5 8Z");
  });

  it("opens the overflow menu from the three-line button", async () => {
    const bar = document.createElement("bld-toolbar") as BldToolbar;
    bar.app = new AppState();
    document.body.append(bar);
    await bar.updateComplete;

    const dropdown = () => bar.shadowRoot?.querySelector('[data-testid="toolbar-menu-dropdown"]');
    expect(dropdown()?.classList.contains("show")).toBe(false);

    (bar.shadowRoot?.querySelector('[data-testid="toolbar-menu"]') as HTMLButtonElement).click();
    await bar.updateComplete;
    expect(dropdown()?.classList.contains("show")).toBe(true);
    expect(dropdown()?.querySelector('[data-testid="menu-about"]')).not.toBeNull();
    expect(dropdown()?.querySelector('[data-testid="menu-new-canvas"]')).not.toBeNull();
    expect(dropdown()?.querySelector('[data-testid="menu-save-diagram"]')).not.toBeNull();
    expect(dropdown()?.querySelector('[data-testid="menu-open-diagram"]')).not.toBeNull();
    expect(dropdown()?.querySelector('[data-testid="menu-import-xml"]')).not.toBeNull();
    expect(dropdown()?.querySelector('[data-testid="menu-export-xml"]')).not.toBeNull();
    expect(dropdown()?.querySelector('[data-testid="menu-zoom-in"]')).not.toBeNull();
    expect(dropdown()?.querySelector('[data-testid="menu-catalogs"]')?.textContent).toBe("Catalogs");
    expect(dropdown()?.querySelector('[data-testid="menu-catalog-types.xml"]')?.textContent).toContain("Types");
    expect(dropdown()?.querySelector('[data-testid="menu-catalog-control-systems.xml"]')?.textContent).toContain(
      "Control Systems",
    );
    expect(dropdown()?.textContent).not.toContain("types.xml");
  });

  it("toggles a catalog from the overflow menu by display name", async () => {
    const app = new AppState();
    const bar = document.createElement("bld-toolbar") as BldToolbar;
    bar.app = app;
    document.body.append(bar);
    await bar.updateComplete;

    (bar.shadowRoot?.querySelector('[data-testid="toolbar-menu"]') as HTMLButtonElement).click();
    await bar.updateComplete;
    const control = bar.shadowRoot?.querySelector(
      '[data-testid="menu-catalog-control-systems.xml"]',
    ) as HTMLButtonElement;
    expect(control.getAttribute("aria-checked")).toBe("true");
    control.click();
    await bar.updateComplete;
    expect(app.blockDef("timer")).toBeUndefined();
    expect(
      bar.shadowRoot?.querySelector('[data-testid="menu-catalog-control-systems.xml"]')?.getAttribute("aria-checked"),
    ).toBe("false");
    expect(bar.shadowRoot?.querySelector('[data-testid="toolbar-menu-dropdown"]')?.classList.contains("show")).toBe(
      true,
    );
  });

  it("renders a Blocks toggle for the compact palette", async () => {
    const bar = document.createElement("bld-toolbar") as BldToolbar;
    bar.app = new AppState();
    document.body.append(bar);
    await bar.updateComplete;

    const toggle = bar.shadowRoot?.querySelector('[data-testid="toolbar-palette"]') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-label")).toBe("Blocks");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    toggle.click();
    await bar.updateComplete;
    expect(bar.app.paletteOpen).toBe(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(bar.hasAttribute("data-compact")).toBe(false);
    bar.app.compactUi = true;
    await bar.updateComplete;
    expect(bar.hasAttribute("data-compact")).toBe(true);
  });
});
