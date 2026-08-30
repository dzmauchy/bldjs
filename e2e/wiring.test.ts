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
  portTypeText,
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

  it("shows port types only on the source output and compatible inputs while linking", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "quantizer");
    await placeBlock(driver, "timer");
    expect(await portTypeText(driver, "oscilloscope", "output-out")).toBeNull();
    expect(await portTypeText(driver, "quantizer", "input-in")).toBeNull();
    expect(await portTypeText(driver, "quantizer", "output-out")).toBeNull();
    expect(await portTypeText(driver, "timer", "input-in")).toBeNull();

    await clickPortHandle(driver, "oscilloscope", "output-out");
    await driver.wait(async () => (await portTypeText(driver, "oscilloscope", "output-out")) === "c<f64>[]", 5000);
    expect(await portTypeText(driver, "quantizer", "input-in")).toBe("c<f64>");
    expect(await portTypeText(driver, "timer", "input-in")).toBe("c<f64>");
    expect(await portTypeText(driver, "quantizer", "output-out")).toBeNull();

    await clickPortHandle(driver, "quantizer", "input-in");
    await waitForLinks(driver, "1 link");
    await waitForAvoidRouter(driver);
    expect(await portTypeText(driver, "oscilloscope", "output-out")).toBeNull();
    expect(await portTypeText(driver, "quantizer", "input-in")).toBeNull();
    expect(await portTypeText(driver, "timer", "input-in")).toBeNull();

    const path = await connectorPath(driver);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.includes("L ") || path.includes("C ")).toBe(true);
    const tag = await (await diagramCss(driver, "bld-connector")).getTagName();
    expect(tag).toBe("bld-connector");
    const diagram = await waitDeep(driver, "bld-diagram");
    expect(await diagram.getAttribute("data-connector")).toBe("jumpover");
    expect(await diagram.getAttribute("data-worker")).toBe("true");
  });

  it("keeps a second c<f64> wire on the same input", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "timer");
    await clickPortHandle(driver, "oscilloscope", "output-out", 0);
    await clickPortHandle(driver, "timer", "input-in");
    await waitForLinks(driver, "1 link");
    await clickPortHandle(driver, "oscilloscope", "output-out", 1);
    await clickPortHandle(driver, "timer", "input-in");
    await waitForLinks(driver, "2 links");
  });

  it("toggles the same wire off", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "quantizer");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "quantizer", "input-in");
    await waitForLinks(driver, "1 link");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "quantizer", "input-in");
    await waitForLinks(driver, "0 links");
  });

  it("deletes a selected connector", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "quantizer");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "quantizer", "input-in");
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

  it("wires Oscilloscope → Quantizer → Sin → Timer and opens the chart", async () => {
    for (const id of ["timer", "quantizer", "sin", "cos", "oscilloscope"] as const) {
      await placeBlock(driver, id);
    }

    const timerHost = await nodeHost(driver, "timer");
    const timerRoot = await timerHost.getShadowRoot();
    const timerIn = await timerRoot.findElement(By.css('[data-testid="input-in"]'));
    expect(await timerIn.getAttribute("title")).toBe("c<f64>");
    expect(await timerIn.getText()).not.toContain("c<f64>");
    const sinHost = await nodeHost(driver, "sin");
    const sinRoot = await sinHost.getShadowRoot();
    const sinIn = await sinRoot.findElement(By.css('[data-testid="input-in"]'));
    const sinOut = await sinRoot.findElement(By.css('[data-testid="output-out"]'));
    expect(await sinIn.getText()).not.toContain("c<f64>");
    expect(await sinOut.getText()).not.toContain("c<f64>");
    expect(await sinOut.getAttribute("title")).toBe("c<f64>");
    const cosHost = await nodeHost(driver, "cos");
    const cosRoot = await cosHost.getShadowRoot();
    const cosIn = await cosRoot.findElement(By.css('[data-testid="input-in"]'));
    const cosOut = await cosRoot.findElement(By.css('[data-testid="output-out"]'));
    expect(await cosIn.getText()).not.toContain("c<f64>");
    expect(await cosOut.getText()).not.toContain("c<f64>");
    expect(await portTypeText(driver, "timer", "input-in")).toBeNull();
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

    await wire("oscilloscope", "out", "quantizer", "in", "1 link");
    await wire("quantizer", "out", "sin", "in", "2 links");
    await wire("sin", "out", "timer", "in", "3 links");

    const scope = await nodeHost(driver, "oscilloscope");
    const chart = await (await scope.getShadowRoot()).findElement(By.css('[data-testid^="chart-"]'));
    expect(await chart.getAttribute("disabled")).toBe("true");
    await runDiagram(driver);
    await driver.wait(async () => (await chart.getAttribute("disabled")) === null, 10000);
    await chart.click();
    await waitDeep(driver, '[data-testid="oscilloscope-modal"]');
    await driver.wait(async () => {
      const plot = await queryDeepAll(driver, '[data-testid="oscilloscope-chart"]');
      return plot.length === 1 && (await plot[0].getAttribute("data-series-count")) === "1";
    }, 5000);
    await driver.actions({ async: true }).sendKeys(Key.ESCAPE).perform();
    await driver.wait(async () => (await queryDeepAll(driver, '[data-testid="oscilloscope-modal"]')).length === 0, 5000);
  });

  it("opens a multi-axis chart after two vector channels run", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "sin");
    await placeBlock(driver, "cos");
    await placeBlock(driver, "timer");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "sin", "input-in");
    await waitForLinks(driver, "1 link");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "cos", "input-in");
    await waitForLinks(driver, "2 links");
    await clickPortHandle(driver, "sin", "output-out");
    await clickPortHandle(driver, "timer", "input-in");
    await waitForLinks(driver, "3 links");
    await clickPortHandle(driver, "cos", "output-out");
    await clickPortHandle(driver, "timer", "input-in");
    await waitForLinks(driver, "4 links");

    const scope = await nodeHost(driver, "oscilloscope");
    const chart = await (await scope.getShadowRoot()).findElement(By.css('[data-testid^="chart-"]'));
    await runDiagram(driver);
    await driver.wait(async () => (await chart.getAttribute("disabled")) === null, 10000);
    await chart.click();
    await waitDeep(driver, '[data-testid="oscilloscope-modal"]');
    await driver.wait(async () => {
      const plot = await queryDeepAll(driver, '[data-testid="oscilloscope-chart"]');
      return plot.length === 1 && (await plot[0].getAttribute("data-series-count")) === "2";
    }, 5000);
  });

  it("moves the connector when a wired node is dragged", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "quantizer");
    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "quantizer", "input-in");
    await waitForLinks(driver, "1 link");
    const before = await connectorPath(driver);
    const host = await nodeHost(driver, "oscilloscope");
    const header = await (await host.getShadowRoot()).findElement(By.css(".flow-node-header"));
    await driver.actions({ async: true }).dragAndDrop(header, { x: 90, y: 30 }).perform();
    await driver.wait(async () => (await connectorPath(driver)) !== before, 5000);
  });
});
