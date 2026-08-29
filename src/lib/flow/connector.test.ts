import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { registerFlowElements } from "./index";

describe("BldConnector", () => {
  beforeAll(() => {
    registerFlowElements();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("lays out an svg path from world endpoints", () => {
    const link = document.createElement("bld-connector");
    link.endpoints = { from: { x: 10, y: 20 }, to: { x: 120, y: 40 } };
    document.body.append(link);

    const d = link.pathData();
    expect(d.startsWith("M ")).toBe(true);
    expect(link.shadowRoot?.querySelector("svg")).not.toBeNull();
    expect(Number.parseFloat(link.style.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(link.style.height)).toBeGreaterThan(0);
    expect(link.style.left).toMatch(/px$/);
  });

  it("marks preview connectors as non-interactive", () => {
    const link = document.createElement("bld-connector");
    link.preview = true;
    link.selected = true;
    document.body.append(link);
    expect(link.hasAttribute("data-preview")).toBe(true);
    expect(link.hasAttribute("data-selected")).toBe(true);
  });

  it("emits linkpointerdown from the hit path", () => {
    const link = document.createElement("bld-connector");
    link.endpoints = { from: { x: 0, y: 0 }, to: { x: 80, y: 0 } };
    document.body.append(link);
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
