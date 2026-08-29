import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Builder, By, Key, until, type WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";

function chromeOptions(): chrome.Options {
  const options = new chrome.Options();
  options.addArguments(
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1400,900",
  );
  const binary = process.env.CHROME_BIN ?? (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
  if (binary) {
    options.setChromeBinaryPath(binary);
  }
  return options;
}

async function doubleClickPalette(driver: WebDriver, defId: string): Promise<void> {
  const item = await driver.wait(until.elementLocated(By.css(`[data-testid="palette-${defId}"]`)), 10000);
  await driver.actions({ async: true }).doubleClick(item).perform();
}

async function waitForBlock(driver: WebDriver, defId: string): Promise<void> {
  await driver.wait(until.elementLocated(By.css(`[data-block-def="${defId}"]`)), 10000);
}

describe("workspace UI", () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = await new Builder().forBrowser("chrome").setChromeOptions(chromeOptions()).build();
    await driver.get(BASE_URL);
    await driver.wait(until.elementLocated(By.css('[data-testid="diagram-canvas"]')), 20000);
    await driver.wait(until.elementLocated(By.css('[data-testid="palette-b_string"]')), 10000);
  });

  afterAll(async () => {
    await driver?.quit();
  });

  it("loads the palette and empty canvas", async () => {
    const blocks = await driver.findElement(By.css('[data-testid="status-blocks"]')).getText();
    expect(blocks).toBe("0 blocks");
    const hint = await driver.findElement(By.css(".canvas-hint-card")).getText();
    expect(hint).toContain("Drop blocks here");
  });

  it("drops String and List.of, then wires them to infer List<String>", async () => {
    await doubleClickPalette(driver, "b_string");
    await waitForBlock(driver, "b_string");
    await doubleClickPalette(driver, "b_list_of");
    await waitForBlock(driver, "b_list_of");

    const output = await driver.findElement(
      By.css('[data-block-def="b_string"] [data-testid="output-value"] .svelte-flow__handle'),
    );
    const input = await driver.findElement(
      By.css('[data-block-def="b_list_of"] [data-testid="input-elements"] .svelte-flow__handle'),
    );
    await output.click();
    await input.click();

    await driver.wait(async () => {
      const text = await driver.findElement(By.css('[data-testid="status-links"]')).getText();
      return text === "1 link";
    }, 8000);

    const listCard = await driver.findElement(By.css('[data-block-def="b_list_of"]')).getText();
    expect(listCard).toContain("List<String>");
  });

  it("zooms from the toolbar", async () => {
    const before = await driver.findElement(By.css('[data-testid="zoom-percent"]')).getText();
    await driver.findElement(By.css('[data-testid="zoom-in"]')).click();
    await driver.wait(async () => {
      const after = await driver.findElement(By.css('[data-testid="zoom-percent"]')).getText();
      return after !== before;
    }, 5000);
  });

  it("deletes the selected block", async () => {
    const before = await driver.findElement(By.css('[data-testid="status-blocks"]')).getText();
    expect(before).not.toBe("0 blocks");
    await driver.findElement(By.css('[data-block-def="b_list_of"]')).click();
    await driver.actions({ async: true }).sendKeys(Key.DELETE).perform();
    await driver.wait(async () => {
      const text = await driver.findElement(By.css('[data-testid="status-blocks"]')).getText();
      return text !== before;
    }, 5000);
  });

  it("opens About from the help menu", async () => {
    await driver.findElement(By.css('[data-testid="menu-help"]')).click();
    await driver.findElement(By.css('[data-testid="menu-about"]')).click();
    await driver.wait(until.elementLocated(By.css('[data-testid="about-modal"]')), 5000);
    await driver.findElement(By.css('[data-testid="about-modal"] .btn-close')).click();
  });

  it("wires Oscilloscope → Sin → Quantizer → Timer and opens the chart", async () => {
    await driver.findElement(By.css('[data-testid="menu-file"]')).click();
    await driver.findElement(By.css('[data-testid="menu-new-canvas"]')).click();
    await driver.wait(async () => {
      const text = await driver.findElement(By.css('[data-testid="status-blocks"]')).getText();
      return text === "0 blocks";
    }, 5000);

    for (const id of ["oscilloscope", "sin", "quantizer", "timer"] as const) {
      await doubleClickPalette(driver, id);
      await waitForBlock(driver, id);
    }

    async function wire(fromDef: string, fromPort: string, toDef: string, toPort: string): Promise<void> {
      const output = await driver.findElement(
        By.css(`[data-block-def="${fromDef}"] [data-testid="output-${fromPort}"] .svelte-flow__handle`),
      );
      const input = await driver.findElement(
        By.css(`[data-block-def="${toDef}"] [data-testid="input-${toPort}"] .svelte-flow__handle`),
      );
      await output.click();
      await input.click();
    }

    await wire("oscilloscope", "out", "sin", "in");
    await wire("sin", "out", "quantizer", "consumer");
    await wire("quantizer", "out", "timer", "consumer");

    await driver.wait(async () => {
      const text = await driver.findElement(By.css('[data-testid="status-links"]')).getText();
      return text === "3 links";
    }, 8000);

    await driver.findElement(By.css('[data-block-def="oscilloscope"] [data-testid^="chart-"]')).click();
    await driver.wait(until.elementLocated(By.css('[data-testid="oscilloscope-modal"]')), 5000);
  });
});
