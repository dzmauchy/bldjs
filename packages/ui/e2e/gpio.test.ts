import { expect, test, type Page } from "@playwright/test";
import {
  clickPortHandle,
  newCanvas,
  nodeHost,
  openAppMenu,
  openWorkspace,
  placeBlock,
  waitForLinks,
} from "./actions";

test.describe.configure({ mode: "serial" });

test.describe("gpio", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openWorkspace(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("toggles GPIO in the browser and runs GPIO Out → GPIO In", async () => {
    await newCanvas(page);
    await placeBlock(page, "gpio_in");
    await placeBlock(page, "gpio_out");

    const inputToggle = nodeHost(page, "gpio_in").locator('[data-testid^="gpio-"]');
    const outputToggle = nodeHost(page, "gpio_out").locator('[data-testid^="gpio-"]');
    await expect(inputToggle).toHaveAttribute("role", "switch");
    await expect(outputToggle).toHaveAttribute("role", "switch");
    await expect(inputToggle).toBeEnabled();
    await expect(outputToggle).toBeDisabled();
    await expect(inputToggle).not.toBeChecked();
    await expect(outputToggle).not.toBeChecked();
    await expect(nodeHost(page, "gpio_in").locator(".form-check-label")).toContainText("P0 LOW");
    await expect(nodeHost(page, "gpio_out").locator(".form-check-label")).toContainText("P1 LOW");
    await inputToggle.click();
    await expect(inputToggle).toBeChecked();
    await expect(nodeHost(page, "gpio_in").locator(".form-check-label")).toContainText("P0 HIGH");

    await clickPortHandle(page, "gpio_out", "output-out");
    await clickPortHandle(page, "gpio_in", "input-in");
    await waitForLinks(page, "1 link");

    await page.locator('[data-testid="toolbar-run"]').click();
    await expect(page.locator('[data-testid="status-run"]')).toHaveText("Running", { timeout: 30_000 });
    await expect(outputToggle).toBeChecked({ timeout: 5_000 });
    await expect(nodeHost(page, "gpio_out").locator(".form-check-label")).toContainText("P1 HIGH");
    await expect(nodeHost(page, "gpio_in").locator('[data-testid^="inputs-"]')).toBeDisabled();
    await expect(nodeHost(page, "gpio_out").locator('[data-testid^="inputs-"]')).toBeDisabled();

    await openAppMenu(page);
    await expect(page.locator('[data-testid="menu-hardware"]')).toHaveText("Hardware");
    await expect(page.locator('[data-testid="menu-deploy-mcu"]')).toBeVisible();
  });
});
