import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync, tick } from "svelte";
import "./BldConnector.svelte";

describe("BldConnector", () => {
  beforeAll(() => {
    expect(customElements.get("bld-connector")).toBeDefined();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("lays out an svg path from world endpoints", async () => {
    const link = document.createElement("bld-connector");
    Object.assign(link, { from: { x: 10, y: 20 }, to: { x: 120, y: 40 } });
    document.body.append(link);
    flushSync();
    await tick();

    const d = link.shadowRoot?.querySelector(".path-stroke")?.getAttribute("d") ?? "";
    expect(d.startsWith("M ")).toBe(true);
    expect(link.shadowRoot?.querySelector("svg")).not.toBeNull();
    expect(Number.parseFloat(link.style.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(link.style.height)).toBeGreaterThan(0);
    expect(link.style.left).toMatch(/px$/);
  });

  it("updates the path when an endpoint moves with its node", async () => {
    const link = document.createElement("bld-connector");
    Object.assign(link, { from: { x: 0, y: 40 }, to: { x: 120, y: 40 } });
    document.body.append(link);
    flushSync();
    await tick();
    const before = link.shadowRoot?.querySelector(".path-stroke")?.getAttribute("d") ?? "";
    Object.assign(link, { from: { x: 80, y: 40 } });
    flushSync();
    await tick();
    const after = link.shadowRoot?.querySelector(".path-stroke")?.getAttribute("d") ?? "";
    expect(after).not.toBe(before);
    expect(after.startsWith("M ")).toBe(true);
  });

  it("marks preview connectors as non-interactive", async () => {
    const link = document.createElement("bld-connector");
    Object.assign(link, { preview: true, selected: true, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } });
    document.body.append(link);
    flushSync();
    await tick();
    expect(link.hasAttribute("data-preview")).toBe(true);
    expect(link.hasAttribute("data-selected")).toBe(true);
  });

  it("emits linkpointerdown from the hit path", async () => {
    const link = document.createElement("bld-connector");
    Object.assign(link, { from: { x: 0, y: 0 }, to: { x: 80, y: 0 } });
    document.body.append(link);
    flushSync();
    await tick();
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
