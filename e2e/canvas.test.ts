import { expect, test, type Page } from "@playwright/test";
import {
  boxOf,
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

test.describe.configure({ mode: "serial" });

test.describe("canvas", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openWorkspace(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("loads the palette and an empty canvas of custom elements", async () => {
    expect(await statusBlocks(page)).toBe("0 blocks");
    await expect(diagramCss(page, ".hint-card")).toContainText("Drop blocks here");
    const parentNs = await waitDeep(page, '[data-testid="ns-com.dauch.cs"]');
    expect((await parentNs.innerText()).toLowerCase()).toContain("control systems");
    const genNs = await waitDeep(page, '[data-testid="ns-com.dauch.cs.gen"]');
    expect((await genNs.innerText()).toLowerCase()).toContain("gen");
    const nested = await page.evaluate(() => {
      const walk = (root: ParentNode, selector: string): Element | null => {
        const match = (root as ParentNode & { querySelector: Document["querySelector"] }).querySelector(selector);
        if (match) {
          return match;
        }
        for (const node of root.querySelectorAll("*")) {
          if (node.shadowRoot) {
            const found = walk(node.shadowRoot, selector);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };
      const parent = walk(document, '[data-testid="ns-com.dauch.cs"]');
      const child = walk(document, '[data-testid="ns-com.dauch.cs.gen"]');
      return Boolean(parent?.parentElement?.contains(child));
    });
    expect(nested).toBe(true);
    const paletteItem = await waitDeep(page, '[data-testid="palette-timer"]');
    expect(await paletteItem.innerText()).toContain("Timer");
    expect(await paletteItem.innerText()).not.toContain("→");
    const paletteIcon = page.locator('[data-testid="palette-timer"] bld-block-icon svg');
    await expect(paletteIcon).toBeVisible();
    const glyphNs = await paletteIcon.evaluate((svg) => {
      const g = svg.querySelector("path, rect, circle, ellipse");
      return g && g.namespaceURI;
    });
    expect(glyphNs).toBe("http://www.w3.org/2000/svg");
    const defined = await page.evaluate(() => [
      !!customElements.get("bld-app"),
      !!customElements.get("bld-diagram"),
      !!customElements.get("bld-node"),
      !!customElements.get("bld-connector"),
    ]);
    expect(defined).toEqual([true, true, true, true]);
    await waitForAvoidRouter(page);
  });

  test("zooms from the canvas toolbar", async () => {
    const before = await statusZoom(page);
    await waitDeep(page, "bld-diagram");
    await diagramCss(page, '[data-testid="zoom-in"]').click();
    await expect(page.locator('[data-testid="status-zoom"]')).not.toHaveText(before);
    await diagramCss(page, '[data-testid="zoom-reset"]').click();
    await expect(page.locator('[data-testid="status-zoom"]')).toHaveText("100%");
  });

  test("places nodes as flex-sized custom elements", async () => {
    await placeBlock(page, "timer");
    await placeBlock(page, "quantizer");
    const timerBox = await boxOf(nodeHost(page, "timer"));
    const quantizerBox = await boxOf(nodeHost(page, "quantizer"));
    expect(timerBox.width).toBeGreaterThan(80);
    expect(timerBox.height).toBeGreaterThan(40);
    expect(quantizerBox.width).toBeGreaterThan(80);
    expect(quantizerBox.height).toBeGreaterThan(40);
    expect((await nodeHost(page, "timer").evaluate((el) => el.tagName)).toLowerCase()).toBe("bld-node");
  });

  test("pans the world when dragging empty canvas", async () => {
    const host = nodeHost(page, "timer");
    const before = await boxOf(host);
    const canvas = diagramCss(page, '[data-testid="diagram-canvas"]');
    const box = await boxOf(canvas);
    await canvas.hover({ position: { x: 24, y: 24 } });
    await page.mouse.down();
    await page.mouse.move(box.x + 114, box.y + 24);
    await page.mouse.up();
    await expect
      .poll(async () => {
        const after = await boxOf(host);
        return Math.abs(after.x - before.x) > 10;
      })
      .toBe(true);
  });

  test("drags a node by its header", async () => {
    const host = nodeHost(page, "timer");
    const before = await boxOf(host);
    const header = host.locator(".flow-node-header");
    const headerBox = await boxOf(header);
    await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(headerBox.x + headerBox.width / 2 + 70, headerBox.y + headerBox.height / 2 + 40);
    await page.mouse.up();
    await expect
      .poll(async () => {
        const after = await boxOf(host);
        return Math.abs(after.x - before.x) > 8 || Math.abs(after.y - before.y) > 8;
      })
      .toBe(true);
  });

  test("deletes the selected block with Delete", async () => {
    const before = await statusBlocks(page);
    expect(before).not.toBe("0 blocks");
    await nodeHost(page, "quantizer").click();
    await pressDelete(page);
    await expect(page.locator('[data-testid="status-blocks"]')).not.toHaveText(before);
    await expect(diagramRoot(page).locator('bld-node[data-block-def="quantizer"]')).toHaveCount(0);
  });

  test("drops a palette item onto the canvas", async () => {
    await newCanvas(page);
    await dropOnDiagram(page, "cos");
    await waitForBlock(page, "cos");
    expect(await statusBlocks(page)).toBe("1 block");
  });
});
