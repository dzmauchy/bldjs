import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type WebDriver } from "selenium-webdriver";
import {
  diagramRoot,
  newCanvas,
  nodeHost,
  openAppMenu,
  openWorkspace,
  placeBlock,
  queryDeepAll,
  statusBlocks,
  statusZoom,
  waitDeep,
} from "./actions";
import { createDriver } from "./harness";

describe("menus", () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = await createDriver();
    await openWorkspace(driver);
  });

  afterAll(async () => {
    await driver?.quit();
  });

  it("serves the page with a wasm-safe script CSP", async () => {
    const csp = await driver.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      fetch(location.href, { method: "GET" })
        .then((response) => done(response.headers.get("content-security-policy") ?? ""))
        .catch((error) => done(String(error)));
    `);
    expect(csp).toBe("script-src 'self' 'wasm-unsafe-eval';");
  });

  it("shows Run and Stop on the toolbar with SVG icons", async () => {
    const run = await waitDeep(driver, '[data-testid="toolbar-run"]');
    const stop = await waitDeep(driver, '[data-testid="toolbar-stop"]');
    expect(await run.getText()).toContain("Run");
    expect(await stop.getText()).toContain("Stop");
    expect(await stop.getAttribute("disabled")).toBe("true");

    async function svgNs(buttonTestId: string): Promise<string | null> {
      return driver.executeScript(
        `
        const selector = arguments[0];
        const walk = (root) => {
          const match = root.querySelector(selector);
          if (match) return match;
          for (const node of root.querySelectorAll("*")) {
            if (node.shadowRoot) {
              const found = walk(node.shadowRoot);
              if (found) return found;
            }
          }
          return null;
        };
        const button = walk(document);
        const icon = button && button.querySelector("bld-block-icon");
        const svg = icon && icon.shadowRoot && icon.shadowRoot.querySelector("svg");
        const glyph = svg && svg.querySelector("path, rect, circle, ellipse");
        return glyph && glyph.namespaceURI;
        `,
        `[data-testid="${buttonTestId}"]`,
      ) as Promise<string | null>;
    }

    expect(await svgNs("toolbar-run")).toBe("http://www.w3.org/2000/svg");
    expect(await svgNs("toolbar-stop")).toBe("http://www.w3.org/2000/svg");
    expect(await svgNs("toolbar-menu")).toBe("http://www.w3.org/2000/svg");
  });

  it("opens About from the three-line menu", async () => {
    await openAppMenu(driver);
    await (await waitDeep(driver, '[data-testid="menu-about"]')).click();
    const modal = await waitDeep(driver, '[data-testid="about-modal"]');
    expect(await modal.getText()).toContain("About Bld");
    await (await waitDeep(driver, '[data-testid="about-modal"] .btn-close')).click();
    await driver.wait(async () => (await queryDeepAll(driver, '[data-testid="about-modal"]')).length === 0, 5000);
  });

  it("zooms from the View menu", async () => {
    const before = await statusZoom(driver);
    await openAppMenu(driver);
    await (await waitDeep(driver, '[data-testid="menu-zoom-in"]')).click();
    await driver.wait(async () => (await statusZoom(driver)) !== before, 5000);
    await openAppMenu(driver);
    await (await waitDeep(driver, '[data-testid="menu-reset-view"]')).click();
    await driver.wait(async () => (await statusZoom(driver)) === "100%", 5000);
  });

  it("clears the canvas from File → New canvas", async () => {
    await placeBlock(driver, "b_f64");
    expect(await statusBlocks(driver)).not.toBe("0 blocks");
    await newCanvas(driver);
    expect(await statusBlocks(driver)).toBe("0 blocks");
    expect(await (await diagramRoot(driver)).findElements({ css: "bld-node" })).toHaveLength(0);
  });

  it("deletes the selection from the File menu", async () => {
    await placeBlock(driver, "b_i32");
    await (await nodeHost(driver, "b_i32")).click();
    await openAppMenu(driver);
    await (await waitDeep(driver, '[data-testid="menu-delete-selected"]')).click();
    await driver.wait(async () => (await statusBlocks(driver)) === "0 blocks", 5000);
  });
});
