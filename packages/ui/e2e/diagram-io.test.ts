import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  clickPortHandle,
  newCanvas,
  openAppMenu,
  openWorkspace,
  placeBlock,
  statusBlocks,
  waitForLinks,
} from "./actions";

async function wireMiniPipeline(page: Page): Promise<void> {
  await newCanvas(page);
  await placeBlock(page, "scope");
  await placeBlock(page, "timer");
  await clickPortHandle(page, "scope", "output-out");
  await clickPortHandle(page, "timer", "input-in");
  await waitForLinks(page, "1 link");
}

test.describe("diagram files", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openWorkspace(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("exports and imports diagram JSON", async () => {
    await wireMiniPipeline(page);
    expect(await statusBlocks(page)).toBe("2 blocks");

    await openAppMenu(page);
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-testid="menu-export-json"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const json = await readFile(path!, "utf8");
    expect(json).toContain('"type": "scope"');
    expect(json).toContain('"type": "timer"');
    expect(json).toContain('"links"');

    await newCanvas(page);
    expect(await statusBlocks(page)).toBe("0 blocks");

    await openAppMenu(page);
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('[data-testid="menu-import-json"]').click(),
    ]);
    await fileChooser.setFiles({
      name: "pipeline.json",
      mimeType: "application/json",
      buffer: Buffer.from(json),
    });
    await expect(page.locator('[data-testid="status-blocks"]')).toHaveText("2 blocks");
    await waitForLinks(page, "1 link");
  });

  test("saves and loads a diagram from IndexedDB", async () => {
    await wireMiniPipeline(page);
    await openAppMenu(page);
    await page.locator('[data-testid="menu-save-diagram"]').click();
    const modal = page.locator('[data-testid="diagram-io-modal"]');
    await expect(modal).toBeInViewport();
    await modal.locator('[data-testid="diagram-save-name"]').fill("Mini pipeline");
    await modal.locator('[data-testid="diagram-save-confirm"]').click();
    await expect(modal).toHaveCount(0);

    await newCanvas(page);
    expect(await statusBlocks(page)).toBe("0 blocks");

    await openAppMenu(page);
    await page.locator('[data-testid="menu-open-diagram"]').click();
    await expect(page.locator('[data-testid="diagram-io-modal"]')).toBeInViewport();
    await page.locator('[data-testid="saved-diagram-load"]').first().click();
    await expect(page.locator('[data-testid="status-blocks"]')).toHaveText("2 blocks");
    await waitForLinks(page, "1 link");
  });
});
