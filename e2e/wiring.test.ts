import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { By, Key, type WebDriver } from "selenium-webdriver";
import {
  clickConnector,
  clickPortHandle,
  connectorPath,
  connectorWorldPolylines,
  diagramCss,
  diagramRoot,
  dragNodeBy,
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

function collinearOverlap(left: { x: number; y: number }[], right: { x: number; y: number }[]): number {
  const segments = (pts: { x: number; y: number }[]) => {
    const out: { axis: "h" | "v"; a: number; b: number; pos: number }[] = [];
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1]!;
      const point = pts[i]!;
      if (Math.abs(prev.y - point.y) < 1 && Math.abs(prev.x - point.x) >= 1) {
        out.push({ axis: "h", a: Math.min(prev.x, point.x), b: Math.max(prev.x, point.x), pos: prev.y });
      } else if (Math.abs(prev.x - point.x) < 1 && Math.abs(prev.y - point.y) >= 1) {
        out.push({ axis: "v", a: Math.min(prev.y, point.y), b: Math.max(prev.y, point.y), pos: prev.x });
      }
    }
    return out;
  };
  let longest = 0;
  for (const a of segments(left)) {
    for (const b of segments(right)) {
      if (a.axis !== b.axis || Math.abs(a.pos - b.pos) > 1) {
        continue;
      }
      longest = Math.max(longest, Math.min(a.b, b.b) - Math.max(a.a, b.a));
    }
  }
  return longest;
}

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

  it("adds extra ports for a second wire and removes them with the connector", async () => {
    await placeBlock(driver, "oscilloscope");
    await placeBlock(driver, "sin");
    await placeBlock(driver, "cos");
    await placeBlock(driver, "timer");

    async function portNames(defId: string, side: "in" | "out"): Promise<string[]> {
      const host = await nodeHost(driver, defId);
      const root = await host.getShadowRoot();
      const ports = await root.findElements(By.css(`[data-port][data-side="${side}"]`));
      return Promise.all(ports.map((port) => port.getAttribute("data-name")));
    }

    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "sin", "input-in");
    await waitForLinks(driver, "1 link");
    expect(await portNames("oscilloscope", "out")).toEqual(["out"]);
    expect(await portNames("sin", "in")).toEqual(["in"]);
    const scopeRoot = await (await nodeHost(driver, "oscilloscope")).getShadowRoot();
    expect(await scopeRoot.findElements(By.css('[data-vector="out"] .block-port-vector-rail'))).toHaveLength(1);
    expect(await (await scopeRoot.findElement(By.css('[data-vector="out"] .block-port-name'))).getText()).toBe("out");

    await clickPortHandle(driver, "oscilloscope", "output-out");
    await clickPortHandle(driver, "cos", "input-in");
    await waitForLinks(driver, "2 links");
    expect(await portNames("oscilloscope", "out")).toEqual(["out", "out[1]"]);
    expect(await portNames("cos", "in")).toEqual(["in"]);
    expect(await scopeRoot.findElements(By.css('[data-vector="out"] [data-handle]'))).toHaveLength(2);
    expect(await (await scopeRoot.findElement(By.css('[data-vector="out"] .block-port-name'))).getText()).toBe("out");

    await clickPortHandle(driver, "sin", "output-out");
    await clickPortHandle(driver, "timer", "input-in");
    await waitForLinks(driver, "3 links");
    expect(await portNames("timer", "in")).toEqual(["in"]);

    await clickPortHandle(driver, "cos", "output-out");
    await clickPortHandle(driver, "timer", "input-in");
    await waitForLinks(driver, "4 links");
    expect(await portNames("timer", "in")).toEqual(["in", "in[1]"]);
    const timerRoot = await (await nodeHost(driver, "timer")).getShadowRoot();
    expect(await timerRoot.findElements(By.css('[data-vector="in"] .block-port-vector-rail'))).toHaveLength(1);
    expect(await timerRoot.findElements(By.css('[data-vector="in"] [data-handle]'))).toHaveLength(2);
    expect(await (await timerRoot.findElement(By.css('[data-vector="in"] .block-port-name'))).getText()).toBe("in");

    await clickPortHandle(driver, "oscilloscope", "output-out[1]");
    await clickPortHandle(driver, "cos", "input-in");
    await waitForLinks(driver, "3 links");
    expect(await portNames("oscilloscope", "out")).toEqual(["out"]);

    await clickPortHandle(driver, "cos", "output-out");
    await clickPortHandle(driver, "timer", "input-in[1]");
    await waitForLinks(driver, "2 links");
    expect(await portNames("timer", "in")).toEqual(["in"]);
  });

  it("keeps two inputs on distinct connector approaches", async () => {
    await placeBlock(driver, "cos");
    await placeBlock(driver, "sin");
    await placeBlock(driver, "quantizer");

    const cosBox = await (await nodeHost(driver, "cos")).getRect();
    const sinBox = await (await nodeHost(driver, "sin")).getRect();
    const quantizerBox = await (await nodeHost(driver, "quantizer")).getRect();
    await dragNodeBy(driver, "sin", cosBox.x - sinBox.x, cosBox.y + cosBox.height + 36 - sinBox.y);
    await dragNodeBy(
      driver,
      "quantizer",
      cosBox.x + cosBox.width + 96 - quantizerBox.x,
      cosBox.y - quantizerBox.y,
    );

    await clickPortHandle(driver, "cos", "output-out");
    await clickPortHandle(driver, "quantizer", "input-in");
    await waitForLinks(driver, "1 link");
    await clickPortHandle(driver, "sin", "output-out");
    await clickPortHandle(driver, "quantizer", "input-in");
    await waitForLinks(driver, "2 links");
    await waitForAvoidRouter(driver);
    await driver.wait(async () => {
      const polylines = await connectorWorldPolylines(driver);
      return polylines.length === 2 && polylines.every((pts) => pts.length >= 2);
    }, 10000);
    await driver.wait(async () => {
      const polylines = await connectorWorldPolylines(driver);
      return polylines.length === 2 && collinearOverlap(polylines[0]!, polylines[1]!) < 16;
    }, 10000);
    const polylines = await connectorWorldPolylines(driver);
    expect(polylines).toHaveLength(2);
    expect(collinearOverlap(polylines[0]!, polylines[1]!)).toBeLessThan(16);
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
    const icon = await (await host.getShadowRoot()).findElement(By.css(".flow-node-icon"));
    await driver.actions({ async: true }).dragAndDrop(icon, { x: 90, y: 30 }).perform();
    await driver.wait(async () => (await connectorPath(driver)) !== before, 5000);
  });
});
