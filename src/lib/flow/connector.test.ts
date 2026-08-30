import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BldConnector } from "./connector";
import { FLOW_PERIODS_MS } from "$lib/runtime/flow";
import "./connector";

async function mountConnector(init: Partial<BldConnector>): Promise<BldConnector> {
  const link = document.createElement("bld-connector");
  Object.assign(link, init);
  document.body.append(link);
  await link.updateComplete;
  return link;
}

describe("BldConnector", () => {
  beforeAll(() => {
    expect(customElements.get("bld-connector")).toBeDefined();
    const cssText = (BldConnector.styles as { cssText: string }).cssText;
    for (let style = 0; style < 10; style += 1) {
      expect(cssText).toContain(`[data-flow="${style}"]`);
      expect(cssText).toContain(`${FLOW_PERIODS_MS[style]}ms`);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("lays out an svg path from world endpoints", async () => {
    const link = await mountConnector({ from: { x: 10, y: 20 }, to: { x: 120, y: 40 } });
    const d = link.shadowRoot?.querySelector(".path-stroke")?.getAttribute("d") ?? "";
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("L ");
    expect(link.shadowRoot?.querySelector("svg")).not.toBeNull();
    expect(Number.parseFloat(link.style.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(link.style.height)).toBeGreaterThan(20);
    expect(link.style.left).toMatch(/px$/);
    expect(link.hasAttribute("data-flow")).toBe(false);
  });

  it("picks a logarithmic animating style from measured connector frequency", async () => {
    const link = await mountConnector({ from: { x: 0, y: 0 }, to: { x: 80, y: 0 }, hz: 10 });
    expect(link.getAttribute("data-flow")).toBe("7");
    expect(link.dataset.hz).toBe("10");
    link.hz = 100;
    await link.updateComplete;
    expect(link.getAttribute("data-flow")).toBe("9");
    link.hz = 0.1;
    await link.updateComplete;
    expect(link.getAttribute("data-flow")).toBe("0");
    link.hz = 1;
    await link.updateComplete;
    expect(link.getAttribute("data-flow")).toBe("2");
    link.hz = 0;
    await link.updateComplete;
    expect(link.hasAttribute("data-flow")).toBe(false);
  });

  it("updates the path when an endpoint moves with its node", async () => {
    const link = await mountConnector({ from: { x: 0, y: 40 }, to: { x: 120, y: 40 } });
    const before = link.shadowRoot?.querySelector(".path-stroke")?.getAttribute("d") ?? "";
    link.from = { x: 80, y: 40 };
    await link.updateComplete;
    const after = link.shadowRoot?.querySelector(".path-stroke")?.getAttribute("d") ?? "";
    expect(after).not.toBe(before);
    expect(after.startsWith("M ")).toBe(true);
  });

  it("marks preview connectors as non-interactive", async () => {
    const link = await mountConnector({
      preview: true,
      selected: true,
      from: { x: 0, y: 0 },
      to: { x: 10, y: 0 },
    });
    expect(link.hasAttribute("data-preview")).toBe(true);
    expect(link.hasAttribute("data-selected")).toBe(true);
  });

  it("emits linkpointerdown from the hit path", async () => {
    const link = await mountConnector({ from: { x: 0, y: 0 }, to: { x: 80, y: 0 } });
    let fired = false;
    link.addEventListener("linkpointerdown", () => {
      fired = true;
    });
    link.shadowRoot!.querySelector(".path-hit")!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    expect(fired).toBe(true);
  });
});
