import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { By, Key, type WebDriver } from "selenium-webdriver";
import {
  clickConnector,
  clickPortHandle,
  connectorPath,
  diagramCss,
  diagramRoot,
  newCanvas,
  nodeHost,
  openWorkspace,
  placeBlock,
  pressDelete,
  queryDeepAll,
  statusLinks,
  waitDeep,
  runDiagram,
  waitForAvoidRouter,
  waitForLinks,
} from "./actions";
import { createDriver } from "./harness";

describe("wiring", () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = await createDriver();
    await openWorkspace(driver);
  });

  afterAll(async () => {
    await driver?.quit();
  });

  beforeEach(async () => {
    await newCanvas(driver);
  });

  it("shows port types only as a hover hint", async () => {
    await placeBlock(driver, "sin");
    await waitForAvoidRouter(driver);

    const sinHost = await nodeHost(driver, "sin");
    const sinRoot = await sinHost.getShadowRoot();
    const sinOut = await sinRoot.findElement(By.css('[data-testid="output-out"]'));
    expect(await sinOut.getText()).not.toContain("c<f64>");
    expect(await sinOut.getAttribute("title")).toBe("c<f64>");
    const hint = await sinRoot.findElement(By.css('[data-testid="output-out-type"]'));
    expect(await hint.getCssValue("visibility")).toBe("hidden");
    await driver.actions({ async: true }).move({ origin: sinOut }).perform();
    await driver.wait(async () => (await hint.getCssValue("visibility")) === "visible", 5000);
    expect(await hint.getText()).toBe("c<f64>");
  });

  it("toggles the same wire off", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "sin");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "sin", "input-in");
    await waitForLinks(driver, "1 link");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "sin", "input-in");
    await waitForLinks(driver, "0 links");
  });

  it("deletes a selected connector", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "sin");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "sin", "input-in");
    await waitForLinks(driver, "1 link");
    await clickConnector(driver);
    await pressDelete(driver);
    await waitForLinks(driver, "0 links");
    expect(await (await diagramRoot(driver)).findElements(By.css("bld-connector"))).toHaveLength(0);
  });

  it("cancels an in-progress link with Escape", async () => {
    await placeBlock(driver, "oscilloscope");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await driver.wait(async () => {
      const preview = await (await diagramRoot(driver)).findElements(By.css('[data-testid="connector-preview"]'));
      return preview.length === 1;
    }, 5000);
    await driver.actions({ async: true }).sendKeys(Key.ESCAPE).perform();
    await driver.wait(async () => {
      const preview = await (await diagramRoot(driver)).findElements(By.css('[data-testid="connector-preview"]'));
      return preview.length === 0;
    }, 5000);
    expect(await statusLinks(driver)).toBe("0 links");
  });

  it("wires a meter and quantizer on bottom ports, then opens the chart", async () => {
    for (const id of ["timer", "quantizer", "sin", "cos", "oscilloscope"] as const) {
      await placeBlock(driver, id);
    }

    const timerHost = await nodeHost(driver, "timer");
    const timerRoot = await timerHost.getShadowRoot();
    const timerIn = await timerRoot.findElement(By.css('[data-testid="input-in"]'));
    const timerSync = await timerRoot.findElement(By.css('[data-testid="input-sync"]'));
    expect(await timerIn.getAttribute("title")).toBe("c<f64>");
    expect(await timerIn.getText()).not.toContain("c<f64>");
    expect(await timerSync.getAttribute("data-place")).toBe("bottom");
    const sinHost = await nodeHost(driver, "sin");
    const sinRoot = await sinHost.getShadowRoot();
    const sinIn = await sinRoot.findElement(By.css('[data-testid="input-in"]'));
    expect(await sinIn.getAttribute("data-place")).toBe("bottom");
    expect(await sinIn.getText()).not.toContain("c<f64>");
    const timerHint = await timerRoot.findElement(By.css('[data-testid="input-in-type"]'));
    await driver.actions({ async: true }).move({ origin: timerIn }).perform();
    await driver.wait(async () => (await timerHint.getCssValue("visibility")) === "visible", 5000);
    expect(await timerHint.getText()).toBe("c<f64>");
    const timerIcon = await timerRoot.findElement(By.css(".flow-node-icon svg"));
    expect(await timerIcon.isDisplayed()).toBe(true);
    const glyphNs = await driver.executeScript(
      "const g = arguments[0].querySelector('path, rect, circle, ellipse'); return g && g.namespaceURI;",
      timerIcon,
    );
    expect(glyphNs).toBe("http://www.w3.org/2000/svg");

    async function wire(fromDef: string, fromPort: string, toDef: string, toPort: string, expected: string): Promise<void> {
      await clickPortHandle(driver, fromDef, `output-${fromPort}`);
      await clickPortHandle(driver, toDef, `input-${toPort}`);
      await waitForLinks(driver, expected);
    }

    await wire("oscilloscope", "out", "sin", "in", "1 link");
    await wire("sin", "out", "timer", "in", "2 links");
    await wire("quantizer", "out", "timer", "sync", "3 links");

    const path = await connectorPath(driver);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.includes("L ") || path.includes("C ")).toBe(true);
    const tag = await (await diagramCss(driver, "bld-connector")).getTagName();
    expect(tag).toBe("bld-connector");
    const diagram = await waitDeep(driver, "bld-diagram");
    expect(await diagram.getAttribute("data-connector")).toBe("jumpover");
    expect(await diagram.getAttribute("data-worker")).toBe("true");

    const scope = await nodeHost(driver, "oscilloscope");
    const chart = await (await scope.getShadowRoot()).findElement(By.css('[data-testid^="chart-"]'));
    expect(await chart.getAttribute("disabled")).toBe("true");
    await runDiagram(driver);
    await driver.wait(async () => (await chart.getAttribute("disabled")) === null, 10000);
    await chart.click();
    await waitDeep(driver, '[data-testid="oscilloscope-modal"]');
    await driver.actions({ async: true }).sendKeys(Key.ESCAPE).perform();
    await driver.wait(async () => (await queryDeepAll(driver, '[data-testid="oscilloscope-modal"]')).length === 0, 5000);
  });

  it("moves the connector when a wired node is dragged", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "sin");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "sin", "input-in");
    await waitForLinks(driver, "1 link");
    const before = await connectorPath(driver);
    const host = await nodeHost(driver, "oscilloscope");
    const header = await (await host.getShadowRoot()).findElement(By.css(".flow-node-header"));
    await driver.actions({ async: true }).dragAndDrop(header, { x: 90, y: 30 }).perform();
    await driver.wait(async () => (await connectorPath(driver)) !== before, 5000);
  });
});
