import { expect, test, type Page } from "@playwright/test";
import { boxOf, diagramCss, dropOnDiagram, nodeHost, statusBlocks, waitDeep, waitForBlock } from "./actions";

test.describe.configure({ mode: "serial" });

test.describe("phone canvas", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/");
    await page.locator("bld-diagram").waitFor();
    await page.locator('[data-testid="diagram-canvas"]').waitFor();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("gives the canvas the full phone width with the palette closed", async () => {
    const canvas = diagramCss(page, '[data-testid="diagram-canvas"]');
    const box = await boxOf(canvas);
    expect(box.width).toBeGreaterThan(350);
    await expect(page.locator('[data-testid="toolbar-palette"]')).toBeVisible();
    await expect(page.locator('[data-testid="palette-timer"]')).toBeHidden();
  });

  test("opens the blocks overlay from the toolbar", async () => {
    await page.locator('[data-testid="toolbar-palette"]').click();
    const item = await waitDeep(page, '[data-testid="palette-timer"]');
    await expect(item).toBeVisible();
    const canvas = await boxOf(diagramCss(page, '[data-testid="diagram-canvas"]'));
    expect(canvas.width).toBeGreaterThan(350);
    await page.locator('[data-testid="palette-close"]').click();
    await expect(page.locator('[data-testid="palette-timer"]')).toBeHidden();
  });

  test("drops a block centered on the pointer", async () => {
    await page.locator('[data-testid="toolbar-palette"]').click();
    await waitDeep(page, '[data-testid="palette-sin"]');
    const canvas = diagramCss(page, '[data-testid="diagram-canvas"]');
    const dropAt = await boxOf(canvas);
    const dropX = dropAt.x + dropAt.width / 2;
    await dropOnDiagram(page, "sin");
    await waitForBlock(page, "sin");
    expect(await statusBlocks(page)).toBe("1 block");
    const node = await boxOf(nodeHost(page, "sin"));
    const centerX = node.x + node.width / 2;
    expect(Math.abs(centerX - dropX)).toBeLessThan(Math.abs(node.x - dropX));
  });
});
