import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { By, type WebDriver } from "selenium-webdriver";
import {
  diagramCss,
  diagramRoot,
  newCanvas,
  nodeHost,
  openWorkspace,
  placeBlock,
  pressDelete,
  statusBlocks,
  statusZoom,
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
    const paletteItem = await driver.findElement(By.css('[data-testid="palette-b_string"]')).getText();
    expect(paletteItem).toContain("String");
    expect(paletteItem).not.toContain("→");
    const defined = await driver.executeScript(
      "return [!!customElements.get('bld-diagram'), !!customElements.get('bld-node'), !!customElements.get('bld-connector')]",
    );
    expect(defined).toEqual([true, true, true]);
  });

  it("zooms from the canvas toolbar", async () => {
    const before = await statusZoom(driver);
    await driver.findElement(By.css("bld-diagram"));
    const zoomIn = await diagramCss(driver, '[data-testid="zoom-in"]');
    await zoomIn.click();
    await driver.wait(async () => (await statusZoom(driver)) !== before, 5000);
    const reset = await diagramCss(driver, '[data-testid="zoom-reset"]');
    await reset.click();
    await driver.wait(async () => (await statusZoom(driver)) === "100%", 5000);
  });

  it("places nodes as flex-sized custom elements", async () => {
    await placeBlock(driver, "b_string");
    await placeBlock(driver, "b_decision");
    const stringBox = await (await nodeHost(driver, "b_string")).getRect();
    const decisionBox = await (await nodeHost(driver, "b_decision")).getRect();
    expect(stringBox.width).toBeGreaterThan(80);
    expect(stringBox.height).toBeGreaterThan(40);
    expect(decisionBox.height).toBeGreaterThan(stringBox.height);
    const tag = await (await nodeHost(driver, "b_string")).getTagName();
    expect(tag).toBe("bld-node");
  });

  it("pans the world when dragging empty canvas", async () => {
    const host = await nodeHost(driver, "b_string");
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
    const host = await nodeHost(driver, "b_string");
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
    await (await nodeHost(driver, "b_decision")).click();
    await pressDelete(driver);
    await driver.wait(async () => (await statusBlocks(driver)) !== before, 5000);
    const leftover = await (await diagramRoot(driver)).findElements(By.css('bld-node[data-block-def="b_decision"]'));
    expect(leftover).toHaveLength(0);
  });

  it("drops a palette item onto the canvas", async () => {
    await newCanvas(driver);
    await driver.executeScript(`
      const diagram = document.querySelector("bld-diagram");
      const rect = diagram.getBoundingClientRect();
      const data = new DataTransfer();
      data.setData("application/x-bld-block", "b_integer");
      diagram.dispatchEvent(new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
    `);
    await waitForBlock(driver, "b_integer");
    expect(await statusBlocks(driver)).toBe("1 block");
  });
});
