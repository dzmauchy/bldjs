import { expect, test, type Page } from "@playwright/test";
import {
  boxOf,
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
    await expect(inputToggle).toHaveAttribute("aria-label", "GPIO pin 0 LOW");
    await expect(outputToggle).toHaveAttribute("aria-label", "GPIO pin 1 LOW");
    await expect(nodeHost(page, "gpio_in").locator(".form-check-label")).toHaveCount(0);
    await expect(nodeHost(page, "gpio_out").locator(".form-check-label")).toHaveCount(0);
    await expect(inputToggle).toHaveCSS("box-shadow", /rgba\(13,\s*110,\s*253/);
    await expect(outputToggle).toHaveCSS("box-shadow", /rgba\(13,\s*110,\s*253/);
    await expect(inputToggle).toHaveCSS("border-color", "rgb(134, 183, 254)");
    await expect(outputToggle).toHaveCSS("border-color", "rgb(134, 183, 254)");
    for (const defId of ["gpio_in", "gpio_out"] as const) {
      const configBox = await boxOf(nodeHost(page, defId).locator('[data-testid^="inputs-"]'));
      const switchBox = await boxOf(nodeHost(page, defId).locator('[data-testid^="gpio-"]'));
      const configCenter = configBox.x + configBox.width / 2;
      const switchCenter = switchBox.x + switchBox.width / 2;
      expect(Math.abs(configCenter - switchCenter)).toBeLessThan(2);
    }
    await inputToggle.click();
    await expect(inputToggle).toBeChecked();
    await expect(inputToggle).toHaveAttribute("aria-label", "GPIO pin 0 HIGH");
    await inputToggle.click();
    await expect(inputToggle).not.toBeChecked();

    await clickPortHandle(page, "gpio_out", "output-out");
    await clickPortHandle(page, "gpio_in", "input-in");
    await waitForLinks(page, "1 link");

    await page.locator('[data-testid="toolbar-run"]').click();
    await expect(page.locator('[data-testid="status-run"]')).toHaveText("Running", { timeout: 30_000 });
    await page.waitForTimeout(200);
    await expect(outputToggle).not.toBeChecked();
    await expect(outputToggle).toHaveAttribute("aria-label", "GPIO pin 1 LOW");
    await inputToggle.click();
    await expect(inputToggle).toBeChecked();
    await expect(outputToggle).toBeChecked({ timeout: 5_000 });
    await expect(outputToggle).toHaveAttribute("aria-label", "GPIO pin 1 HIGH");
    await expect(nodeHost(page, "gpio_in").locator('[data-testid^="inputs-"]')).toBeDisabled();
    await expect(nodeHost(page, "gpio_out").locator('[data-testid^="inputs-"]')).toBeDisabled();

    await openAppMenu(page);
    await expect(page.locator('[data-testid="menu-hardware"]')).toHaveText("Hardware");
    await expect(page.locator('[data-testid="menu-deploy-mcu"]')).toBeVisible();
  });
});
