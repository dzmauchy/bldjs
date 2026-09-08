import { expect, test, type Page } from "@playwright/test";
import {
  boxOf,
  clickPortHandle,
  dragNodeBy,
  newCanvas,
  nodeHost,
  openWorkspace,
  placeBlock,
  waitForLinks,
  waitForScopeOverlay,
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
    await page.waitForTimeout(300);
    await expect(page.locator("bld-connector:not([data-preview])[data-flow]")).toHaveCount(0);
  });

  test("starts Constant (1) and GPIO In (OFF) -> Product -> Overshoot -> Scope with no signal on Scope until GPIO is toggled", async () => {
    await newCanvas(page);
    await placeBlock(page, "constant");
    await placeBlock(page, "gpio_in");
    await placeBlock(page, "product");
    await placeBlock(page, "overshoot");
    await placeBlock(page, "scope");

    await dragNodeBy(page, "constant", -240, -100);
    await dragNodeBy(page, "gpio_in", -240, 100);
    await dragNodeBy(page, "product", -80, 0);
    await dragNodeBy(page, "overshoot", 80, 0);
    await dragNodeBy(page, "scope", 240, 0);

    // Wire Scope out -> Overshoot in
    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "overshoot", "input-in");
    await waitForLinks(page, "1 link");

    // Wire Overshoot out -> Product in
    await clickPortHandle(page, "overshoot", "output-out");
    await clickPortHandle(page, "product", "input-in");
    await waitForLinks(page, "2 links");

    // Wire Product out[0] -> Constant in
    await clickPortHandle(page, "product", "output-out");
    await clickPortHandle(page, "constant", "input-in");
    await waitForLinks(page, "3 links");

    // Wire Product out[1] -> GPIO In in
    await clickPortHandle(page, "product", "output-out[1]");
    await clickPortHandle(page, "gpio_in", "input-in");
    await waitForLinks(page, "4 links");

    const inputToggle = nodeHost(page, "gpio_in").locator('[data-testid^="gpio-"]');
    await expect(inputToggle).not.toBeChecked();

    await page.locator('[data-testid="toolbar-run"]').click();
    await expect(page.locator('[data-testid="status-run"]')).toHaveText("Running", { timeout: 30_000 });

    const chart = nodeHost(page, "scope").locator('[data-testid^="chart-"]');
    await expect(chart).toBeEnabled({ timeout: 5_000 });
    await chart.click();
    await waitForScopeOverlay(page);
    await expect(page.locator('[data-testid="scope-chart"] canvas')).toBeVisible();

    const getScopeSamples = async () => {
      return page.evaluate(() => {
        const appEl = document.querySelector("bld-app") as any;
        const scopeId = appEl?.app?.scopeOpen;
        if (scopeId === undefined || scopeId < 0) return [];
        const series = appEl?.app?.run?.snapshotScope(scopeId) ?? [];
        return series[0]?.samples ?? [];
      });
    };

    // Baseline: Constant (1) * GPIO In (0) is 0; Overshoot receives 0 and must not produce a signal spike
    await expect.poll(async () => {
      const samples: number[] = await getScopeSamples();
      const finite = samples.filter((v: number) => Number.isFinite(v));
      return finite.length > 0 && finite.every((v: number) => Math.abs(v) < 1e-5);
    }, { timeout: 5_000 }).toBe(true);

    // Close Scope overlay to uncover the canvas
    await page.locator('[data-testid="scope-close"]').click();

    // Toggle GPIO In to HIGH (1)
    await inputToggle.click();
    await expect(inputToggle).toBeChecked();

    // Reopen Scope chart
    await chart.click();
    await waitForScopeOverlay(page);

    // Overshoot signal must now emerge (underdamped step response to 1.0, exceeding 1.05)
    await expect.poll(async () => {
      const samples: number[] = await getScopeSamples();
      return samples.some((v: number) => v > 1.05);
    }, { timeout: 5_000 }).toBe(true);

    await page.locator('[data-testid="scope-close"]').click();
    await page.locator('[data-testid="toolbar-stop"]').click();
  });
});
