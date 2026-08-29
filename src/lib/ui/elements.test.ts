import { afterEach, describe, expect, it } from "vitest";
import "$lib/ui/app-element";
import { BldBlockIcon } from "./block-icon";

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
