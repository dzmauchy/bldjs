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
    await expect(page.locator('[data-testid="palette-random"]')).toContainText("Random");
    await expect(page.locator('[data-testid="palette-quantizer"]')).toHaveCount(0);
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
    await placeBlock(page, "sin");
    const timerBox = await boxOf(nodeHost(page, "timer"));
    const sinBox = await boxOf(nodeHost(page, "sin"));
    expect(timerBox.width).toBeGreaterThan(80);
    expect(timerBox.height).toBeGreaterThan(40);
    expect(sinBox.width).toBeGreaterThan(80);
    expect(sinBox.height).toBeGreaterThan(40);
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

  test("drags a node by its icon", async () => {
    const host = nodeHost(page, "timer");
    const before = await boxOf(host);
    const icon = host.locator(".flow-node-icon");
    const iconBox = await boxOf(icon);
    await page.mouse.move(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(iconBox.x + iconBox.width / 2 + 70, iconBox.y + iconBox.height / 2 + 40);
    await page.mouse.up();
    await expect
      .poll(async () => {
        const after = await boxOf(host);
        return Math.abs(after.x - before.x) > 8 || Math.abs(after.y - before.y) > 8;
      })
      .toBe(true);
  });

  test("moves a node with a touch pointer drag", async () => {
    const host = nodeHost(page, "timer");
    const before = await boxOf(host);
    const box = await boxOf(host.locator(".flow-node-icon"));
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.evaluate(
      ({ startX, startY }) => {
        const walk = (root, selector) => {
          const match = root.querySelector?.(selector);
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
        const diagram = walk(document, "bld-diagram");
        const node = diagram?.shadowRoot?.querySelector('bld-node[data-block-def="timer"]');
        const viewport = diagram?.shadowRoot?.querySelector(".viewport");
        if (!node || !viewport) {
          throw new Error("touch drag: timer node or viewport missing");
        }
        const fire = (target, type, clientX, clientY, extra) => {
          target.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 99,
              pointerType: "touch",
              isPrimary: true,
              view: window,
              clientX,
              clientY,
              ...extra,
            }),
          );
        };
        fire(node, "pointerdown", startX, startY, { button: 0, buttons: 1 });
        fire(viewport, "pointermove", startX + 72, startY + 36, { button: -1, buttons: 1 });
        fire(viewport, "pointerup", startX + 72, startY + 36, { button: 0, buttons: 0 });
      },
      { startX, startY },
    );
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
    await nodeHost(page, "sin").click();
    const selected = nodeHost(page, "sin").locator(".flow-node");
    const idle = nodeHost(page, "timer").locator(".flow-node");
    expect(await selected.evaluate((el) => getComputedStyle(el).animationName)).toContain("node-selected-fade");
    expect(await idle.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    expect(await selected.evaluate((el) => getComputedStyle(el).borderColor)).toBe(
      await idle.evaluate((el) => getComputedStyle(el).borderColor),
    );
    await pressDelete(page);
    await expect(page.locator('[data-testid="status-blocks"]')).not.toHaveText(before);
    await expect(diagramRoot(page).locator('bld-node[data-block-def="sin"]')).toHaveCount(0);
  });

  test("drops a palette item onto the canvas", async () => {
    await newCanvas(page);
    await dropOnDiagram(page, "cos");
    await waitForBlock(page, "cos");
    expect(await statusBlocks(page)).toBe("1 block");
  });

  test("places a dropped block with its center on the drop point", async () => {
    await newCanvas(page);
    const canvas = diagramCss(page, '[data-testid="diagram-canvas"]');
    const dropAt = await boxOf(canvas);
    const dropX = dropAt.x + dropAt.width / 2;
    const dropY = dropAt.y + dropAt.height / 2;
    await dropOnDiagram(page, "sin");
    await waitForBlock(page, "sin");
    const node = await boxOf(nodeHost(page, "sin"));
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    expect(Math.abs(centerX - dropX)).toBeLessThan(Math.abs(node.x - dropX));
    expect(Math.abs(centerY - dropY)).toBeLessThan(Math.abs(node.y - dropY));
  });

  test("renders a labeled block with a 32px icon and inset edge circles", async () => {
    await newCanvas(page);
    await placeBlock(page, "sin");
    const host = nodeHost(page, "sin");
    await expect(host.locator(".flow-node-title")).toHaveText("Sin");
    const titleSize = await host.locator(".flow-node-title").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(titleSize).toBeGreaterThan(0);
    expect(titleSize).toBeLessThanOrEqual(11);
    await expect(host.locator(".flow-node")).toHaveAttribute("title", "Sin");
    const icon = host.locator(".flow-node-icon svg");
    const iconBox = await boxOf(icon);
    expect(iconBox.width).toBeGreaterThanOrEqual(30);
    expect(iconBox.width).toBeLessThanOrEqual(34);
    expect(iconBox.height).toBeGreaterThanOrEqual(30);
    expect(iconBox.height).toBeLessThanOrEqual(34);
    const nodeBox = await boxOf(host);
    const inBox = await boxOf(host.locator('[data-testid="input-in"] [data-handle]'));
    const inCenter = inBox.x + inBox.width / 2;
    expect(inCenter - nodeBox.x).toBeGreaterThanOrEqual(0.5);
    expect(inCenter - nodeBox.x).toBeLessThan(4);
    await expect(host.locator('[data-testid="output-out"]')).toHaveCount(0);
    await expect(host.locator(".block-port-name")).toHaveCount(0);
    await expect(host.locator('[data-testid="input-in"]')).toHaveAttribute("title", "c<f64>");
    await expect(host.locator('[data-testid^="inputs-"]')).toBeVisible();
  });

  test("opens generator inputs and defaults period to 10 ms", async () => {
    await newCanvas(page);
    await placeBlock(page, "timer");
    await nodeHost(page, "timer").locator('[data-testid^="inputs-"]').click();
    await expect(page.locator('[data-testid="inputs-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-value-period"]')).toHaveText("10 ms");
    await page.locator('[data-testid="input-range-period"]').fill("25");
    await expect(page.locator('[data-testid="input-value-period"]')).toHaveText("25 ms");
    await page.locator('[data-testid="inputs-close"]').click();
    await expect(page.locator('[data-testid="inputs-modal"]')).toHaveCount(0);
    await placeBlock(page, "scope");
    await expect(nodeHost(page, "scope").locator('[data-testid^="inputs-"]')).toHaveCount(0);
  });
});
