import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { By, type WebDriver } from "selenium-webdriver";
import {
  diagramCss,
  diagramRoot,
  dropOnDiagram,
  newCanvas,
  nodeHost,
  openWorkspace,
  placeBlock,
  pressDelete,
  statusBlocks,
  statusZoom,
  waitDeep,
  waitForAvoidRouter,
  waitForBlock,
} from "./actions";
import { createDriver } from "./harness";

describe("canvas", () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = await createDriver();
    await openWorkspace(driver);
  });

  afterAll(async () => {
    await driver?.quit();
  });

  it("loads the palette and an empty canvas of custom elements", async () => {
    expect(await statusBlocks(driver)).toBe("0 blocks");
    const hint = await (await diagramCss(driver, ".hint-card")).getText();
    expect(hint).toContain("Drop blocks here");
    const paletteItem = await waitDeep(driver, '[data-testid="palette-timer"]');
    expect(await paletteItem.getText()).toContain("Timer");
    expect(await paletteItem.getText()).not.toContain("→");
    const iconHost = await waitDeep(driver, '[data-testid="palette-timer"] bld-block-icon');
    const paletteIcon = await (await iconHost.getShadowRoot()).findElement(By.css("svg"));
    expect(await paletteIcon.isDisplayed()).toBe(true);
    const glyphNs = await driver.executeScript(
      "const g = arguments[0].querySelector('path, rect, circle, ellipse'); return g && g.namespaceURI;",
      paletteIcon,
    );
    expect(glyphNs).toBe("http://www.w3.org/2000/svg");
    const defined = await driver.executeScript(
      "return [!!customElements.get('bld-app'), !!customElements.get('bld-diagram'), !!customElements.get('bld-node'), !!customElements.get('bld-connector')]",
    );
    expect(defined).toEqual([true, true, true, true]);
    await waitForAvoidRouter(driver);
  });

  it("zooms from the canvas toolbar", async () => {
    const before = await statusZoom(driver);
    await waitDeep(driver, "bld-diagram");
    const zoomIn = await diagramCss(driver, '[data-testid="zoom-in"]');
    await zoomIn.click();
    await driver.wait(async () => (await statusZoom(driver)) !== before, 5000);
    const reset = await diagramCss(driver, '[data-testid="zoom-reset"]');
    await reset.click();
    await driver.wait(async () => (await statusZoom(driver)) === "100%", 5000);
  });

  it("places nodes as flex-sized custom elements", async () => {
    await placeBlock(driver, "timer");
    await placeBlock(driver, "quantizer");
    const timerBox = await (await nodeHost(driver, "timer")).getRect();
    const quantizerBox = await (await nodeHost(driver, "quantizer")).getRect();
    expect(timerBox.width).toBeGreaterThan(80);
    expect(timerBox.height).toBeGreaterThan(40);
    expect(quantizerBox.width).toBeGreaterThan(80);
    expect(quantizerBox.height).toBeGreaterThan(40);
    const tag = await (await nodeHost(driver, "timer")).getTagName();
    expect(tag).toBe("bld-node");
  });

  it("pans the world when dragging empty canvas", async () => {
    const host = await nodeHost(driver, "timer");
    const before = await host.getRect();
    const canvas = await diagramCss(driver, '[data-testid="diagram-canvas"]');
    const box = await canvas.getRect();
    const fromX = Math.ceil(-box.width / 2 + 24);
    const fromY = Math.ceil(-box.height / 2 + 24);
    await driver
      .actions({ async: true })
      .move({ origin: canvas, x: fromX, y: fromY })
      .press()
      .move({ origin: canvas, x: fromX + 90, y: fromY })
      .release()
      .perform();
    await driver.wait(async () => {
      const after = await host.getRect();
      return Math.abs(after.x - before.x) > 10;
    }, 5000);
  });

  it("drags a node by its header", async () => {
    const host = await nodeHost(driver, "timer");
    const before = await host.getRect();
    const root = await host.getShadowRoot();
    const header = await root.findElement(By.css(".flow-node-header"));
    await driver.actions({ async: true }).dragAndDrop(header, { x: 70, y: 40 }).perform();
    await driver.wait(async () => {
      const after = await host.getRect();
      return Math.abs(after.x - before.x) > 8 || Math.abs(after.y - before.y) > 8;
    }, 5000);
  });

  it("deletes the selected block with Delete", async () => {
    const before = await statusBlocks(driver);
    expect(before).not.toBe("0 blocks");
    await (await nodeHost(driver, "quantizer")).click();
    await pressDelete(driver);
    await driver.wait(async () => (await statusBlocks(driver)) !== before, 5000);
    const leftover = await (await diagramRoot(driver)).findElements(By.css('bld-node[data-block-def="quantizer"]'));
    expect(leftover).toHaveLength(0);
  });

  it("drops a palette item onto the canvas", async () => {
    await newCanvas(driver);
    await dropOnDiagram(driver, "cos");
    await waitForBlock(driver, "cos");
    expect(await statusBlocks(driver)).toBe("1 block");
  });
});
