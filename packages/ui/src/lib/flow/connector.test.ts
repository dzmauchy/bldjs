import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const cssPath = [
  path.resolve(process.cwd(), "src/app.css"),
  path.resolve(process.cwd(), "packages/ui/src/app.css"),
].find((p) => fs.existsSync(p))!;
const appCss = fs.readFileSync(cssPath, "utf8");
import { BldConnector } from "./connector";
import { FLOW_PERIOD_MIN_MS, flowPeriodMs } from "@bld/model/flow";
import "./connector";

async function mountConnector(init: Partial<BldConnector>): Promise<BldConnector> {
  const link = document.createElement("bld-connector");
  Object.assign(link, init);
  document.body.append(link);
  await link.updateComplete;
  return link;
}

function strokeClip(link: BldConnector): string {
  return (link.renderRoot.querySelector(".path-stroke") as HTMLElement | null)?.style.clipPath ?? "";
}

describe("BldConnector", () => {
  beforeAll(() => {
    expect(customElements.get("bld-connector")).toBeDefined();
    const connectorCss = appCss.slice(
      appCss.indexOf("/* bld-connector */"),
      appCss.indexOf("/* bld-block-icon */"),
    );
    expect(connectorCss).not.toContain("[data-flow=");
    expect(connectorCss).toContain("--flow-period");
    expect(connectorCss).toContain("[data-push]");
    expect(connectorCss).toContain("animation-direction: reverse");
    expect(connectorCss).not.toContain("svg");
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("lays out a clip-path polygon from world endpoints", async () => {
    const link = await mountConnector({ from: { x: 10, y: 20 }, to: { x: 120, y: 40 } });
    const clip = strokeClip(link);
    expect(clip.startsWith("polygon(")).toBe(true);
    expect(link.renderRoot.querySelector("svg")).toBeNull();
    expect(link.renderRoot.querySelector(".path-hit")).not.toBeNull();
    expect(Number.parseFloat(link.style.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(link.style.height)).toBeGreaterThan(20);
    expect(link.style.left).toMatch(/px$/);
    expect(link.hasAttribute("data-flow")).toBe(false);
    expect(link.dataset.points).toMatch(/10,20/);
  });

  it("clips a rounded jumpover corner instead of a sharp elbow", async () => {
    const link = await mountConnector({
      from: { x: 0, y: 10 },
      to: { x: 200, y: 80 },
      points: [
        { x: 80, y: 10 },
        { x: 80, y: 80 },
      ],
    });
    const clip = strokeClip(link);
    expect(clip.startsWith("polygon(")).toBe(true);
    expect((clip.match(/px/g) ?? []).length).toBeGreaterThan(8);
  });

  it("applies animation duration from measured frequency via inline style", async () => {
    const link = await mountConnector({ from: { x: 0, y: 0 }, to: { x: 80, y: 0 }, hz: 10 });
    expect(link.hasAttribute("data-flow")).toBe(true);
    expect(link.dataset.hz).toBe("10");
    expect(link.style.getPropertyValue("--flow-period")).toBe(`${flowPeriodMs(10)}ms`);
    link.hz = 100;
    await link.updateComplete;
    expect(link.style.getPropertyValue("--flow-period")).toBe(`${FLOW_PERIOD_MIN_MS}ms`);
    link.hz = 0.1;
    await link.updateComplete;
    expect(link.style.getPropertyValue("--flow-period")).toBe(`${flowPeriodMs(0.1)}ms`);
    link.hz = 1;
    await link.updateComplete;
    expect(link.style.getPropertyValue("--flow-period")).toBe("1000ms");
    link.hz = 0;
    await link.updateComplete;
    expect(link.hasAttribute("data-flow")).toBe(false);
    expect(link.style.getPropertyValue("--flow-period")).toBe("");
    expect(link.renderRoot.querySelector(".seg")).toBeNull();
  });

  it("reverses dash travel when the wire is a push-model consumer", async () => {
    const pull = await mountConnector({ from: { x: 0, y: 0 }, to: { x: 80, y: 0 }, hz: 10 });
    expect(pull.hasAttribute("data-push")).toBe(false);
    expect(pull.renderRoot.querySelector(".seg")).not.toBeNull();
    pull.push = true;
    await pull.updateComplete;
    expect(pull.hasAttribute("data-push")).toBe(true);
    const push = await mountConnector({ from: { x: 0, y: 0 }, to: { x: 80, y: 0 }, hz: 5, push: true });
    expect(push.hasAttribute("data-push")).toBe(true);
    expect(push.hasAttribute("data-flow")).toBe(true);
    expect(push.renderRoot.querySelector(".seg")).not.toBeNull();
  });

  it("updates the clip-path when an endpoint moves with its node", async () => {
    const link = await mountConnector({ from: { x: 0, y: 40 }, to: { x: 120, y: 40 } });
    const before = strokeClip(link);
    link.from = { x: 80, y: 40 };
    await link.updateComplete;
    const after = strokeClip(link);
    expect(after).not.toBe(before);
    expect(after.startsWith("polygon(")).toBe(true);
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
    expect(link.renderRoot.querySelector(".path-stroke")?.classList.contains("is-dashed")).toBe(true);
  });

  it("emits linkpointerdown from the hit path", async () => {
    const link = await mountConnector({ from: { x: 0, y: 0 }, to: { x: 80, y: 0 } });
    let fired = false;
    link.addEventListener("linkpointerdown", () => {
      fired = true;
    });
    link.renderRoot.querySelector(".path-hit")!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    expect(fired).toBe(true);
  });
});
