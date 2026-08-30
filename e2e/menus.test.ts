import { expect, test, type Page } from "@playwright/test";
import {
  newCanvas,
  nodeHost,
  openAppMenu,
  openWorkspace,
  placeBlock,
  statusBlocks,
  statusZoom,
  waitDeep,
  diagramRoot,
} from "./actions";

test.describe.configure({ mode: "serial" });

test.describe("menus", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openWorkspace(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("serves the page with isolation headers and a wasm-safe script CSP", async () => {
    const headers = await page.evaluate(async () => {
      const response = await fetch(location.href, { method: "GET" });
      return {
        csp: response.headers.get("content-security-policy") ?? "",
        coop: response.headers.get("cross-origin-opener-policy") ?? "",
        coep: response.headers.get("cross-origin-embedder-policy") ?? "",
      };
    });
    expect(headers.csp).toBe("script-src 'self' 'wasm-unsafe-eval';");
    expect(headers.coop).toBe("same-origin");
    expect(headers.coep).toBe("require-corp");
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  });

  test("uses the bld.svg mark as favicon and toolbar brand", async () => {
    const favicon = await page.evaluate(() => {
      const link = document.querySelector('link[rel="icon"]');
      return {
        type: link && link.getAttribute("type"),
        href: link && link.getAttribute("href"),
      };
    });
    expect(favicon.type).toBe("image/svg+xml");
    expect(favicon.href).toMatch(/bld[^/]*\.svg/);

    const brand = await waitDeep(page, '[data-testid="app-brand"]');
    expect(await brand.innerText()).not.toContain("Bld");
    const viewBox = await page.evaluate(() => {
      const walk = (root: ParentNode): SVGSVGElement | null => {
        const match = root.querySelector('[data-testid="app-brand"] svg');
        if (match) {
          return match as SVGSVGElement;
        }
        for (const node of root.querySelectorAll("*")) {
          if (node.shadowRoot) {
            const found = walk(node.shadowRoot);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };
      const svg = walk(document);
      return svg && svg.getAttribute("viewBox");
    });
    expect(viewBox).toBe("0 0 512 512");
  });

  test("shows Run and Stop on the toolbar with SVG icons", async () => {
    const run = await waitDeep(page, '[data-testid="toolbar-run"]');
    const stop = await waitDeep(page, '[data-testid="toolbar-stop"]');
    expect(await run.innerText()).toContain("Run");
    expect(await stop.innerText()).toContain("Stop");
    await expect(stop).toBeDisabled();

    async function svgNs(buttonTestId: string): Promise<string | null> {
      return page.evaluate((selector) => {
        const walk = (root: ParentNode): Element | null => {
          const match = root.querySelector(selector);
          if (match) {
            return match;
          }
          for (const node of root.querySelectorAll("*")) {
            if (node.shadowRoot) {
              const found = walk(node.shadowRoot);
              if (found) {
                return found;
              }
            }
          }
          return null;
        };
        const button = walk(document);
        const icon = button && button.querySelector("bld-block-icon");
        const svg = icon && icon.shadowRoot && icon.shadowRoot.querySelector("svg");
        const glyph = svg && svg.querySelector("path, rect, circle, ellipse");
        return glyph && glyph.namespaceURI;
      }, `[data-testid="${buttonTestId}"]`);
    }

    expect(await svgNs("toolbar-run")).toBe("http://www.w3.org/2000/svg");
    expect(await svgNs("toolbar-stop")).toBe("http://www.w3.org/2000/svg");
    expect(await svgNs("toolbar-menu")).toBe("http://www.w3.org/2000/svg");
  });

  test("opens About from the three-line menu", async () => {
    await openAppMenu(page);
    await page.locator('[data-testid="menu-about"]').click();
    const modal = await waitDeep(page, '[data-testid="about-modal"]');
    await expect(modal).toContainText("About Bld");
    await page.locator('[data-testid="about-modal"] .btn-close').click();
    await expect(page.locator('[data-testid="about-modal"]')).toHaveCount(0);
  });

  test("zooms from the View menu", async () => {
    const before = await statusZoom(page);
    await openAppMenu(page);
    await page.locator('[data-testid="menu-zoom-in"]').click();
    await expect(page.locator('[data-testid="status-zoom"]')).not.toHaveText(before);
    await openAppMenu(page);
    await page.locator('[data-testid="menu-reset-view"]').click();
    await expect(page.locator('[data-testid="status-zoom"]')).toHaveText("100%");
  });

  test("clears the canvas from File → New canvas", async () => {
    await placeBlock(page, "timer");
    expect(await statusBlocks(page)).not.toBe("0 blocks");
    await newCanvas(page);
    expect(await statusBlocks(page)).toBe("0 blocks");
    await expect(diagramRoot(page).locator("bld-node")).toHaveCount(0);
  });

  test("deletes the selection from the File menu", async () => {
    await placeBlock(page, "sin");
    await nodeHost(page, "sin").click();
    await openAppMenu(page);
    await page.locator('[data-testid="menu-delete-selected"]').click();
    await expect(page.locator('[data-testid="status-blocks"]')).toHaveText("0 blocks");
  });
});
