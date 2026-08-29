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

async function clickPortHandle(driver: WebDriver, blockDef: string, testId: string): Promise<void> {
  const handle = await driver.wait(
    until.elementLocated(
      By.css(`[data-block-def="${blockDef}"] .svelte-flow__handle[data-testid="${testId}"]`),
    ),
    10000,
  );
  await driver.wait(until.elementIsVisible(handle), 5000);
  await driver.executeScript("arguments[0].scrollIntoView({block:'nearest', inline:'nearest'});", handle);
  await driver.actions({ async: true }).move({ origin: handle }).click().perform();
}

async function linkCount(driver: WebDriver): Promise<string> {
  return driver.findElement(By.css('[data-testid="status-links"]')).getText();
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
    const paletteItem = await driver.findElement(By.css('[data-testid="palette-b_string"]')).getText();
    expect(paletteItem).toContain("String");
    expect(paletteItem).not.toContain("→");
    const paletteIcon = await driver.findElement(By.css('[data-testid="palette-b_string"] svg'));
    expect(await paletteIcon.isDisplayed()).toBe(true);
  });

  it("drops String and List.of, then wires them to infer List<String>", async () => {
    await doubleClickPalette(driver, "b_string");
    await waitForBlock(driver, "b_string");
    await doubleClickPalette(driver, "b_list_of");
    await waitForBlock(driver, "b_list_of");

    await clickPortHandle(driver, "b_string", "output-value");
    await clickPortHandle(driver, "b_list_of", "input-elements");

    await driver.wait(async () => {
      const text = await driver.findElement(By.css('[data-testid="status-links"]')).getText();
      return text === "1 link";
    }, 8000);

    const listCard = await driver.findElement(By.css('[data-block-def="b_list_of"]')).getText();
    expect(listCard).toContain("List<String>");
  });

  it("zooms from Svelte Flow controls", async () => {
    const before = await driver.findElement(By.css('[data-testid="status-zoom"]')).getText();
    await driver.findElement(By.css(".svelte-flow__controls-zoomin")).click();
    await driver.wait(async () => {
      const after = await driver.findElement(By.css('[data-testid="status-zoom"]')).getText();
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

  it("wires Timer → Quantizer → Sin → Oscilloscope and opens the chart", async () => {
    await driver.findElement(By.css('[data-testid="menu-file"]')).click();
    await driver.findElement(By.css('[data-testid="menu-new-canvas"]')).click();
    await driver.wait(async () => {
      const text = await driver.findElement(By.css('[data-testid="status-blocks"]')).getText();
      return text === "0 blocks";
    }, 5000);

    for (const id of ["timer", "quantizer", "sin", "oscilloscope"] as const) {
      await doubleClickPalette(driver, id);
      await waitForBlock(driver, id);
    }

    const timerCard = await driver.findElement(By.css('[data-block-def="timer"]'));
    expect(await timerCard.getText()).toContain("c<c<c<f64>>>");
    expect(await timerCard.findElement(By.css("svg")).isDisplayed()).toBe(true);

    async function wire(
      fromDef: string,
      fromPort: string,
      toDef: string,
      toPort: string,
      expected: string,
    ): Promise<void> {
      await clickPortHandle(driver, fromDef, `output-${fromPort}`);
      await clickPortHandle(driver, toDef, `input-${toPort}`);
      await driver.wait(async () => (await linkCount(driver)) === expected, 5000);
    }

    await wire("timer", "out", "quantizer", "in", "1 link");
    await wire("quantizer", "out", "sin", "in", "2 links");
    await wire("sin", "out", "oscilloscope", "in", "3 links");

    await driver.findElement(By.css('[data-block-def="oscilloscope"] [data-testid^="chart-"]')).click();
    await driver.wait(until.elementLocated(By.css('[data-testid="oscilloscope-modal"]')), 5000);
  });
});
