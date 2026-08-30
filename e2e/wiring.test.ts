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

  it("wires f64 into array and infers f64[]", async () => {
    await placeBlock(driver, "b_f64");
    await placeBlock(driver, "b_array_of");
    await clickPortHandle(driver, "b_f64", "output-value");
    await clickPortHandle(driver, "b_array_of", "input-elems");
    await waitForLinks(driver, "1 link");
    await waitForAvoidRouter(driver);

    const listHost = await nodeHost(driver, "b_array_of");
    const listRoot = await listHost.getShadowRoot();
    const result = await listRoot.findElement(By.css('[data-testid="output-result"]'));
    const elems = await listRoot.findElement(By.css('[data-testid="input-elems"]'));
    expect(await result.getText()).not.toContain("f64[]");
    expect(await result.getAttribute("title")).toBe("f64[]");
    expect(await elems.getAttribute("title")).toBe("f64");
    const resultHint = await listRoot.findElement(By.css('[data-testid="output-result-type"]'));
    expect(await resultHint.getCssValue("visibility")).toBe("hidden");
    await driver.actions({ async: true }).move({ origin: result }).perform();
    await driver.wait(async () => (await resultHint.getCssValue("visibility")) === "visible", 5000);
    expect(await resultHint.getText()).toBe("f64[]");

    const path = await connectorPath(driver);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.includes("L ") || path.includes("C ")).toBe(true);
    const tag = await (await diagramCss(driver, "bld-connector")).getTagName();
    expect(tag).toBe("bld-connector");
    const diagram = await waitDeep(driver, "bld-diagram");
    expect(await diagram.getAttribute("data-connector")).toBe("jumpover");
    expect(await diagram.getAttribute("data-worker")).toBe("true");
  });

  it("toggles the same wire off", async () => {
    await placeBlock(driver, "b_f64");
    await placeBlock(driver, "b_array_of");
    await clickPortHandle(driver, "b_f64", "output-value");
    await clickPortHandle(driver, "b_array_of", "input-elems");
    await waitForLinks(driver, "1 link");
    await clickPortHandle(driver, "b_f64", "output-value");
    await clickPortHandle(driver, "b_array_of", "input-elems");
    await waitForLinks(driver, "0 links");
  });

  it("deletes a selected connector", async () => {
    await placeBlock(driver, "b_f64");
    await placeBlock(driver, "b_array_of");
    await clickPortHandle(driver, "b_f64", "output-value");
    await clickPortHandle(driver, "b_array_of", "input-elems");
    await waitForLinks(driver, "1 link");
    await clickConnector(driver);
    await pressDelete(driver);
    await waitForLinks(driver, "0 links");
    expect(await (await diagramRoot(driver)).findElements(By.css("bld-connector"))).toHaveLength(0);
  });

  it("cancels an in-progress link with Escape", async () => {
    await placeBlock(driver, "b_f64");
    await clickPortHandle(driver, "b_f64", "output-value");
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

  it("wires Timer → Quantizer → Sin → Oscilloscope and opens the chart", async () => {
    for (const id of ["timer", "quantizer", "sin", "oscilloscope"] as const) {
      await placeBlock(driver, id);
    }

    const timerHost = await nodeHost(driver, "timer");
    const timerRoot = await timerHost.getShadowRoot();
    const timerOut = await timerRoot.findElement(By.css('[data-testid="output-out"]'));
    expect(await timerOut.getAttribute("title")).toBe("c<c<c<f64>>>");
    const timerHint = await timerRoot.findElement(By.css('[data-testid="output-out-type"]'));
    await driver.actions({ async: true }).move({ origin: timerOut }).perform();
    await driver.wait(async () => (await timerHint.getCssValue("visibility")) === "visible", 5000);
    expect(await timerHint.getText()).toBe("c<c<c<f64>>>");
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

    await wire("timer", "out", "quantizer", "in", "1 link");
    await wire("quantizer", "out", "sin", "in", "2 links");
    await wire("sin", "out", "oscilloscope", "in", "3 links");

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
    await placeBlock(driver, "b_f64");
    await placeBlock(driver, "b_array_of");
    await clickPortHandle(driver, "b_f64", "output-value");
    await clickPortHandle(driver, "b_array_of", "input-elems");
    await waitForLinks(driver, "1 link");
    const before = await connectorPath(driver);
    const host = await nodeHost(driver, "b_f64");
    const header = await (await host.getShadowRoot()).findElement(By.css(".flow-node-header"));
    await driver.actions({ async: true }).dragAndDrop(header, { x: 90, y: 30 }).perform();
    await driver.wait(async () => (await connectorPath(driver)) !== before, 5000);
  });
});
