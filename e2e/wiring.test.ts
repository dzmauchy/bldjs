import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { By, Key, until, type WebDriver } from "selenium-webdriver";
import {
  clickConnector,
  clickPortHandle,
  connectorPath,
  newCanvas,
  openWorkspace,
  placeBlock,
  pressDelete,
  statusLinks,
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

    const listHost = await driver.findElement(By.css('bld-node[data-block-def="b_list_of"]'));
    const listText = await listHost.getShadowRoot().then(async (root) => {
      const body = await root.findElement(By.css(".flow-node"));
      return body.getText();
    });
    expect(listText).toContain("List<String>");

    const path = await connectorPath(driver);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).toContain("C ");
    const tag = await driver.findElement(By.css("bld-connector")).getTagName();
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
    expect(await driver.findElements(By.css("bld-connector"))).toHaveLength(0);
  });

  it("cancels an in-progress link with Escape", async () => {
    await placeBlock(driver, "b_string");
    await clickPortHandle(driver, "b_string", "output-value");
    await driver.wait(until.elementLocated(By.css('[data-testid="connector-preview"]')), 5000);
    await driver.actions({ async: true }).sendKeys(Key.ESCAPE).perform();
    await driver.wait(async () => (await driver.findElements(By.css('[data-testid="connector-preview"]'))).length === 0, 5000);
    expect(await statusLinks(driver)).toBe("0 links");
  });

  it("wires Timer → Quantizer → Sin → Oscilloscope and opens the chart", async () => {
    for (const id of ["timer", "quantizer", "sin", "oscilloscope"] as const) {
      await placeBlock(driver, id);
    }

    async function wire(fromDef: string, fromPort: string, toDef: string, toPort: string, expected: string): Promise<void> {
      await clickPortHandle(driver, fromDef, `output-${fromPort}`);
      await clickPortHandle(driver, toDef, `input-${toPort}`);
      await waitForLinks(driver, expected);
    }

    await wire("timer", "out", "quantizer", "in", "1 link");
    await wire("quantizer", "out", "sin", "in", "2 links");
    await wire("sin", "out", "oscilloscope", "in", "3 links");

    const scope = await driver.findElement(By.css('bld-node[data-block-def="oscilloscope"]'));
    const chart = await (await scope.getShadowRoot()).findElement(By.css('[data-testid^="chart-"]'));
    await chart.click();
    await driver.wait(until.elementLocated(By.css('[data-testid="oscilloscope-modal"]')), 5000);
  });
});
