import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { By, until, type WebDriver } from "selenium-webdriver";
import { newCanvas, nodeHost, openWorkspace, placeBlock, statusBlocks, statusZoom } from "./actions";
import { createDriver } from "./harness";

describe("menus", () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = await createDriver();
    await openWorkspace(driver);
  });

  afterAll(async () => {
    await driver?.quit();
  });

  it("opens About from the help menu", async () => {
    await driver.findElement(By.css('[data-testid="menu-help"]')).click();
    await driver.findElement(By.css('[data-testid="menu-about"]')).click();
    await driver.wait(until.elementLocated(By.css('[data-testid="about-modal"]')), 5000);
    const body = await driver.findElement(By.css('[data-testid="about-modal"]')).getText();
    expect(body).toContain("About Bld");
    await driver.findElement(By.css('[data-testid="about-modal"] .btn-close')).click();
    await driver.wait(async () => (await driver.findElements(By.css('[data-testid="about-modal"]'))).length === 0, 5000);
  });

  it("zooms from the View menu", async () => {
    const before = await statusZoom(driver);
    await driver.findElement(By.css('[data-testid="menu-view"]')).click();
    await driver.findElement(By.css('[data-testid="menu-zoom-in"]')).click();
    await driver.wait(async () => (await statusZoom(driver)) !== before, 5000);
    await driver.findElement(By.css('[data-testid="menu-view"]')).click();
    await driver.findElement(By.css('[data-testid="menu-reset-view"]')).click();
    await driver.wait(async () => (await statusZoom(driver)) === "100%", 5000);
  });

  it("clears the canvas from File → New canvas", async () => {
    await placeBlock(driver, "b_string");
    expect(await statusBlocks(driver)).not.toBe("0 blocks");
    await newCanvas(driver);
    expect(await statusBlocks(driver)).toBe("0 blocks");
    expect(await driver.findElements(By.css("bld-node"))).toHaveLength(0);
  });

  it("deletes the selection from the File menu", async () => {
    await placeBlock(driver, "b_int");
    await (await nodeHost(driver, "b_int")).click();
    await driver.findElement(By.css('[data-testid="menu-file"]')).click();
    await driver.findElement(By.css('[data-testid="menu-delete-selected"]')).click();
    await driver.wait(async () => (await statusBlocks(driver)) === "0 blocks", 5000);
  });
});
