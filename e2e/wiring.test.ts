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

  it("wires String into List.of and infers List<String>", async () => {
    await placeBlock(driver, "b_string");
    await placeBlock(driver, "b_list_of");
    await clickPortHandle(driver, "b_string", "output-value");
    await clickPortHandle(driver, "b_list_of", "input-elements");
    await waitForLinks(driver, "1 link");

    const listHost = await nodeHost(driver, "b_list_of");
    const listRoot = await listHost.getShadowRoot();
    const result = await listRoot.findElement(By.css('[data-testid="output-resultList"]'));
    expect(await result.getText()).not.toContain("List<String>");
    expect(await result.getAttribute("title")).toBe("List<String>");

    const path = await connectorPath(driver);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).toContain("C ");
    const tag = await (await diagramCss(driver, "bld-connector")).getTagName();
    expect(tag).toBe("bld-connector");
  });

  it("toggles the same wire off", async () => {
    await placeBlock(driver, "b_string");
    await placeBlock(driver, "b_list_of");
    await clickPortHandle(driver, "b_string", "output-value");
    await clickPortHandle(driver, "b_list_of", "input-elements");
    await waitForLinks(driver, "1 link");
    await clickPortHandle(driver, "b_string", "output-value");
    await clickPortHandle(driver, "b_list_of", "input-elements");
    await waitForLinks(driver, "0 links");
  });

  it("deletes a selected connector", async () => {
    await placeBlock(driver, "b_string");
    await placeBlock(driver, "b_list_of");
    await clickPortHandle(driver, "b_string", "output-value");
    await clickPortHandle(driver, "b_list_of", "input-elements");
    await waitForLinks(driver, "1 link");
    await clickConnector(driver);
    await pressDelete(driver);
    await waitForLinks(driver, "0 links");
    expect(await (await diagramRoot(driver)).findElements(By.css("bld-connector"))).toHaveLength(0);
  });

  it("cancels an in-progress link with Escape", async () => {
    await placeBlock(driver, "b_string");
    await clickPortHandle(driver, "b_string", "output-value");
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
    await chart.click();
    await waitDeep(driver, '[data-testid="oscilloscope-modal"]');
    await driver.actions({ async: true }).sendKeys(Key.ESCAPE).perform();
    await driver.wait(async () => (await queryDeepAll(driver, '[data-testid="oscilloscope-modal"]')).length === 0, 5000);
  });

  it("moves the connector when a wired node is dragged", async () => {
    await placeBlock(driver, "b_string");
    await placeBlock(driver, "b_list_of");
    await clickPortHandle(driver, "b_string", "output-value");
    await clickPortHandle(driver, "b_list_of", "input-elements");
    await waitForLinks(driver, "1 link");
    const before = await connectorPath(driver);
    const host = await nodeHost(driver, "b_string");
    const header = await (await host.getShadowRoot()).findElement(By.css(".flow-node-header"));
    await driver.actions({ async: true }).dragAndDrop(header, { x: 90, y: 30 }).perform();
    await driver.wait(async () => (await connectorPath(driver)) !== before, 5000);
  });
});
