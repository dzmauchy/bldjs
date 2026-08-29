import { By, Key, until, type WebDriver } from "selenium-webdriver";
import { BASE_URL } from "./harness";

export async function openWorkspace(driver: WebDriver): Promise<void> {
  await driver.get(BASE_URL);
  await driver.wait(until.elementLocated(By.css("bld-diagram")), 20000);
  await driver.wait(async () => {
    const canvas = await diagramCss(driver, '[data-testid="diagram-canvas"]').catch(() => null);
    return canvas !== null;
  }, 20000);
  await driver.wait(until.elementLocated(By.css('[data-testid="palette-b_string"]')), 10000);
}

export async function diagramRoot(driver: WebDriver) {
  const host = await driver.wait(until.elementLocated(By.css("bld-diagram")), 10000);
  return host.getShadowRoot();
}

export async function diagramCss(driver: WebDriver, selector: string) {
  const root = await diagramRoot(driver);
  return root.findElement(By.css(selector));
}

export async function newCanvas(driver: WebDriver): Promise<void> {
  await driver.findElement(By.css('[data-testid="menu-file"]')).click();
  await driver.findElement(By.css('[data-testid="menu-new-canvas"]')).click();
  await driver.wait(async () => (await statusBlocks(driver)) === "0 blocks", 5000);
}

export async function statusBlocks(driver: WebDriver): Promise<string> {
  return driver.findElement(By.css('[data-testid="status-blocks"]')).getText();
}

export async function statusLinks(driver: WebDriver): Promise<string> {
  return driver.findElement(By.css('[data-testid="status-links"]')).getText();
}

export async function statusZoom(driver: WebDriver): Promise<string> {
  return driver.findElement(By.css('[data-testid="status-zoom"]')).getText();
}

export async function waitForLinks(driver: WebDriver, expected: string): Promise<void> {
  await driver.wait(async () => (await statusLinks(driver)) === expected, 8000);
}

export async function doubleClickPalette(driver: WebDriver, defId: string): Promise<void> {
  const item = await driver.wait(until.elementLocated(By.css(`[data-testid="palette-${defId}"]`)), 10000);
  await driver.actions({ async: true }).doubleClick(item).perform();
}

export async function waitForBlock(driver: WebDriver, defId: string): Promise<void> {
  await driver.wait(async () => {
    const nodes = await (await diagramRoot(driver)).findElements(By.css(`bld-node[data-block-def="${defId}"]`));
    return nodes.length > 0;
  }, 10000);
}

export async function nodeHost(driver: WebDriver, defId: string) {
  const root = await diagramRoot(driver);
  return root.findElement(By.css(`bld-node[data-block-def="${defId}"]`));
}

export async function clickPortHandle(driver: WebDriver, blockDef: string, testId: string): Promise<void> {
  const host = await nodeHost(driver, blockDef);
  const nodeShadow = await host.getShadowRoot();
  const handle = await nodeShadow.findElement(By.css(`[data-testid="${testId}"]`));
  await driver.wait(until.elementIsVisible(handle), 5000);
  await driver.executeScript("arguments[0].scrollIntoView({block:'nearest', inline:'nearest'});", handle);
  await driver.actions({ async: true }).move({ origin: handle }).click().perform();
}

export async function clickConnector(driver: WebDriver): Promise<void> {
  const host = await diagramCss(driver, "bld-connector");
  const root = await host.getShadowRoot();
  const hit = await root.findElement(By.css(".path-hit"));
  await driver.executeScript(
    `arguments[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerId: 1 }));`,
    hit,
  );
}

export async function connectorPath(driver: WebDriver): Promise<string> {
  const host = await diagramCss(driver, 'bld-connector:not([data-preview])');
  const root = await host.getShadowRoot();
  const stroke = await root.findElement(By.css(".path-stroke"));
  return (await stroke.getAttribute("d")) ?? "";
}

export async function pressDelete(driver: WebDriver): Promise<void> {
  await driver.actions({ async: true }).sendKeys(Key.DELETE).perform();
}

export async function placeBlock(driver: WebDriver, defId: string): Promise<void> {
  await doubleClickPalette(driver, defId);
  await waitForBlock(driver, defId);
}
