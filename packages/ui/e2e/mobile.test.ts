import { expect, test, type Page } from "@playwright/test";
import {
  boxOf,
  clickPortHandle,
  diagramCss,
  dropOnDiagram,
  fireCanvasPan,
  nodeHost,
  statusBlocks,
  waitDeep,
  waitForBlock,
  waitForLinks,
  worldPan,
} from "./actions";

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

  test("gives the canvas the full phone width with compact chrome", async () => {
    const content = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(content).toContain("initial-scale=1");
    expect(content).toContain("maximum-scale=1");
    const fontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(parseFloat(fontSize)).toBeLessThan(16);
    const toolbar = await boxOf(page.locator('[data-testid="app-toolbar"]'));
    expect(toolbar.height).toBeLessThan(40);
    const canvas = diagramCss(page, '[data-testid="diagram-canvas"]');
    const box = await boxOf(canvas);
    const inner = await page.evaluate(() => window.innerWidth);
    expect(box.width).toBeGreaterThan(inner * 0.85);
    await expect(page.locator('[data-testid="toolbar-palette"]')).toBeVisible();
    await expect(page.locator('[data-testid="palette-timer"]')).toBeHidden();
  });

  test("pans the canvas from a touch drag", async () => {
    const before = await worldPan(page);
    await fireCanvasPan(page, 48, 30);
    const after = await worldPan(page);
    expect(after.x).toBe(before.x + 48);
    expect(after.y).toBe(before.y + 30);
  });

  test("opens the blocks overlay from the toolbar", async () => {
    await page.locator('[data-testid="toolbar-palette"]').click();
    const item = await waitDeep(page, '[data-testid="palette-timer"]');
    await expect(item).toBeVisible();
    const canvas = await boxOf(diagramCss(page, '[data-testid="diagram-canvas"]'));
    const inner = await page.evaluate(() => window.innerWidth);
    expect(canvas.width).toBeGreaterThan(inner * 0.85);
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

  test("connects a wire dropped on a block with one compatible input", async () => {
    await page.locator('[data-testid="toolbar-palette"]').click();
    const scopeItem = await waitDeep(page, '[data-testid="palette-scope"]');
    await scopeItem.tap();
    await waitForBlock(page, "scope");
    await clickPortHandle(page, "scope", "output-out");
    await nodeHost(page, "sin").locator(".flow-node-icon").tap();
    await waitForLinks(page, "1 link");
  });
});

test.describe("phone landscape", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });

  test("keeps the palette overlay and lets it scroll", async ({ page }) => {
    await page.goto("/");
    await page.locator("bld-diagram").waitFor();
    await expect(page.locator('[data-testid="toolbar-palette"]')).toBeVisible();
    await page.locator('[data-testid="toolbar-palette"]').click();
    const item = await waitDeep(page, '[data-testid="palette-timer"]');
    await expect(item).toBeVisible();
    const palette = page.locator("bld-palette");
    await expect(palette).toHaveAttribute("data-compact", "");
    const scroll = await palette.evaluate((host) => {
      const list = host.shadowRoot?.querySelector('[data-testid="palette-list"]');
      if (!(list instanceof HTMLElement)) {
        throw new Error("palette-list missing");
      }
      const style = getComputedStyle(list);
      const spacer = document.createElement("div");
      spacer.style.height = "800px";
      list.append(spacer);
      const clientHeight = list.clientHeight;
      const scrollHeight = list.scrollHeight;
      list.scrollTop = 240;
      const after = list.scrollTop;
      spacer.remove();
      return {
        overflowY: style.overflowY,
        hostHeight: host.getBoundingClientRect().height,
        clientHeight,
        scrollHeight,
        after,
      };
    });
    expect(["auto", "scroll"]).toContain(scroll.overflowY);
    expect(scroll.hostHeight).toBeLessThan(360);
    expect(scroll.clientHeight).toBeLessThan(scroll.hostHeight);
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight + 400);
    expect(scroll.after).toBeGreaterThan(100);
  });

  test("pans the canvas from a touch drag", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid="diagram-canvas"]').waitFor();
    const before = await worldPan(page);
    await fireCanvasPan(page, 36, 22);
    const after = await worldPan(page);
    expect(after.x).toBe(before.x + 36);
    expect(after.y).toBe(before.y + 22);
  });
});
