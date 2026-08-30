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

  it("renders Run and Stop with SVG icons and a three-line menu button", async () => {
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
    expect(stop?.textContent?.trim()).toBe("");
    expect(run?.getAttribute("aria-label")).toBe("Run");
    expect(stop?.getAttribute("aria-label")).toBe("Stop");
    expect(run?.textContent).not.toContain("Bld");
    expect((stop as HTMLButtonElement | null)?.disabled).toBe(true);

    const runSvg = await glyph(run);
    const stopSvg = await glyph(stop);
    const menuSvg = await glyph(menu);
    expect(runSvg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(stopSvg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(menuSvg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(menuSvg?.querySelectorAll("path")).toHaveLength(1);
    expect(menuSvg?.querySelector("path")?.getAttribute("d")).toContain("M2.5 4h11");
  });

  it("disables Run while running and Stop while idle", async () => {
    const app = new AppState();
    const bar = document.createElement("bld-toolbar") as BldToolbar;
    bar.app = app;
    document.body.append(bar);
    await bar.updateComplete;

    const runBtn = () => bar.shadowRoot?.querySelector('[data-testid="toolbar-run"]') as HTMLButtonElement;
    const stopBtn = () => bar.shadowRoot?.querySelector('[data-testid="toolbar-stop"]') as HTMLButtonElement;
    expect(runBtn().disabled).toBe(false);
    expect(stopBtn().disabled).toBe(true);

    app.running = true;
    await bar.updateComplete;
    expect(runBtn().disabled).toBe(true);
    expect(stopBtn().disabled).toBe(false);

    app.running = false;
    await bar.updateComplete;
    expect(runBtn().disabled).toBe(false);
    expect(stopBtn().disabled).toBe(true);
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
    expect(dropdown()?.querySelector('[data-testid="menu-zoom-in"]')).not.toBeNull();
  });
});
