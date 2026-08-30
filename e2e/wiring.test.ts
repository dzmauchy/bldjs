import { expect, test, type Page } from "@playwright/test";
import {
  boxOf,
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
  statusLinks,
  waitDeep,
  runDiagram,
  waitForAvoidRouter,
  waitForLinks,
  portTypeText,
} from "./actions";

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

test.describe("wiring", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openWorkspace(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test.beforeEach(async () => {
    await newCanvas(page);
  });

  test("shows port types only on the source output and compatible inputs while linking", async () => {
    await placeBlock(page, "oscilloscope");
    await placeBlock(page, "quantizer");
    await placeBlock(page, "timer");
    expect(await portTypeText(page, "oscilloscope", "output-out")).toBeNull();
    expect(await portTypeText(page, "quantizer", "input-in")).toBeNull();
    expect(await portTypeText(page, "quantizer", "output-out")).toBeNull();
    expect(await portTypeText(page, "timer", "input-in")).toBeNull();

    const scopeBox = await boxOf(nodeHost(page, "oscilloscope"));
    const quantBox = await boxOf(nodeHost(page, "quantizer"));
    const timerBox = await boxOf(nodeHost(page, "timer"));

    await clickPortHandle(page, "oscilloscope", "output-out");
    await expect
      .poll(async () => portTypeText(page, "oscilloscope", "output-out"))
      .toBe("c<f64>[]");
    expect(await portTypeText(page, "quantizer", "input-in")).toBe("c<f64>");
    expect(await portTypeText(page, "timer", "input-in")).toBe("c<f64>");
    expect(await portTypeText(page, "quantizer", "output-out")).toBeNull();

    const scopeAfter = await boxOf(nodeHost(page, "oscilloscope"));
    const quantAfter = await boxOf(nodeHost(page, "quantizer"));
    const timerAfter = await boxOf(nodeHost(page, "timer"));
    expect(scopeAfter.width).toBe(scopeBox.width);
    expect(scopeAfter.height).toBe(scopeBox.height);
    expect(quantAfter.width).toBe(quantBox.width);
    expect(quantAfter.height).toBe(quantBox.height);
    expect(timerAfter.width).toBe(timerBox.width);
    expect(timerAfter.height).toBe(timerBox.height);

    const outHandle = await boxOf(nodeHost(page, "oscilloscope").locator('[data-testid="output-out"] [data-handle]'));
    const outType = nodeHost(page, "oscilloscope").locator('[data-testid="output-out-type"]');
    const outTypeBox = await boxOf(outType);
    expect(outTypeBox.y).toBeGreaterThanOrEqual(outHandle.y + outHandle.height - 1);
    const typeBg = await outType.evaluate((el) => {
      const color = getComputedStyle(el).backgroundColor;
      const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return { color, alpha: parts.length >= 4 ? parts[3]! : 1 };
    });
    expect(typeBg.color).toMatch(/rgba?\(/);
    expect(typeBg.alpha).toBeGreaterThan(0);
    expect(typeBg.alpha).toBeLessThan(1);

    await clickPortHandle(page, "quantizer", "input-in");
    await waitForLinks(page, "1 link");
    await waitForAvoidRouter(page);
    expect(await portTypeText(page, "oscilloscope", "output-out")).toBeNull();
    expect(await portTypeText(page, "quantizer", "input-in")).toBeNull();
    expect(await portTypeText(page, "timer", "input-in")).toBeNull();

    const path = await connectorPath(page);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.includes("L ") || path.includes("C ")).toBe(true);
    expect((await diagramCss(page, "bld-connector").evaluate((el) => el.tagName)).toLowerCase()).toBe("bld-connector");
    const diagram = await waitDeep(page, "bld-diagram");
    await expect(diagram).toHaveAttribute("data-connector", "jumpover");
    await expect(diagram).toHaveAttribute("data-worker", "true");
  });

  test("keeps a second c<f64> wire on the same input", async () => {
    await placeBlock(page, "oscilloscope");
    await placeBlock(page, "oscilloscope");
    await placeBlock(page, "timer");
    await clickPortHandle(page, "oscilloscope", "output-out", 0);
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "oscilloscope", "output-out", 1);
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "2 links");
  });

  test("adds extra ports for a second wire and removes them with the connector", async () => {
    await placeBlock(page, "oscilloscope");
    await placeBlock(page, "sin");
    await placeBlock(page, "cos");
    await placeBlock(page, "timer");

    async function portNames(defId: string, side: "in" | "out"): Promise<string[]> {
      return nodeHost(page, defId)
        .locator(`[data-port][data-side="${side}"]`)
        .evaluateAll((ports) => ports.map((port) => port.getAttribute("data-name") ?? ""));
    }

    await clickPortHandle(page, "oscilloscope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    expect(await portNames("oscilloscope", "out")).toEqual(["out"]);
    expect(await portNames("sin", "in")).toEqual(["in"]);
    const scope = nodeHost(page, "oscilloscope");
    await expect(scope.locator('[data-vector="out"] .block-port-vector-rail')).toHaveCount(1);
    await expect(scope.locator('[data-vector="out"] .block-port-name')).toHaveCount(0);

    await clickPortHandle(page, "oscilloscope", "output-out");
    await clickPortHandle(page, "cos", "input-in");
    await waitForLinks(page, "2 links");
    expect(await portNames("oscilloscope", "out")).toEqual(["out", "out[1]"]);
    expect(await portNames("cos", "in")).toEqual(["in"]);
    await expect(scope.locator('[data-vector="out"] [data-handle]')).toHaveCount(2);
    await expect(scope.locator('[data-vector="out"] .block-port-name')).toHaveCount(0);

    await clickPortHandle(page, "sin", "output-out");
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "3 links");
    expect(await portNames("timer", "in")).toEqual(["in"]);

    await clickPortHandle(page, "cos", "output-out");
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "4 links");
    expect(await portNames("timer", "in")).toEqual(["in", "in[1]"]);
    const timer = nodeHost(page, "timer");
    await expect(timer.locator('[data-vector="in"] .block-port-vector-rail')).toHaveCount(1);
    await expect(timer.locator('[data-vector="in"] [data-handle]')).toHaveCount(2);
    await expect(timer.locator('[data-vector="in"] .block-port-name')).toHaveCount(0);

    await clickPortHandle(page, "oscilloscope", "output-out[1]");
    await clickPortHandle(page, "cos", "input-in");
    await waitForLinks(page, "3 links");
    expect(await portNames("oscilloscope", "out")).toEqual(["out"]);

    await clickPortHandle(page, "cos", "output-out");
    await clickPortHandle(page, "timer", "input-in[1]");
    await waitForLinks(page, "2 links");
    expect(await portNames("timer", "in")).toEqual(["in"]);
  });

  test("keeps two inputs on distinct connector approaches", async () => {
    await placeBlock(page, "cos");
    await placeBlock(page, "sin");
    await placeBlock(page, "quantizer");

    const cosBox = await boxOf(nodeHost(page, "cos"));
    const sinBox = await boxOf(nodeHost(page, "sin"));
    const quantizerBox = await boxOf(nodeHost(page, "quantizer"));
    await dragNodeBy(page, "sin", cosBox.x - sinBox.x, cosBox.y + cosBox.height + 36 - sinBox.y);
    await dragNodeBy(
      page,
      "quantizer",
      cosBox.x + cosBox.width + 96 - quantizerBox.x,
      cosBox.y - quantizerBox.y,
    );

    await clickPortHandle(page, "cos", "output-out");
    await clickPortHandle(page, "quantizer", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "sin", "output-out");
    await clickPortHandle(page, "quantizer", "input-in");
    await waitForLinks(page, "2 links");
    await waitForAvoidRouter(page);
    await expect
      .poll(async () => {
        const polylines = await connectorWorldPolylines(page);
        return polylines.length === 2 && polylines.every((pts) => pts.length >= 2);
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const polylines = await connectorWorldPolylines(page);
        return polylines.length === 2 && collinearOverlap(polylines[0]!, polylines[1]!) < 16;
      })
      .toBe(true);
    const polylines = await connectorWorldPolylines(page);
    expect(polylines).toHaveLength(2);
    expect(collinearOverlap(polylines[0]!, polylines[1]!)).toBeLessThan(16);
  });

  test("toggles the same wire off", async () => {
    await placeBlock(page, "oscilloscope");
    await placeBlock(page, "quantizer");
    await clickPortHandle(page, "oscilloscope", "output-out");
    await clickPortHandle(page, "quantizer", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "oscilloscope", "output-out");
    await clickPortHandle(page, "quantizer", "input-in");
    await waitForLinks(page, "0 links");
  });

  test("deletes a selected connector", async () => {
    await placeBlock(page, "oscilloscope");
    await placeBlock(page, "quantizer");
    await clickPortHandle(page, "oscilloscope", "output-out");
    await clickPortHandle(page, "quantizer", "input-in");
    await waitForLinks(page, "1 link");
    await clickConnector(page);
    await pressDelete(page);
    await waitForLinks(page, "0 links");
    await expect(diagramRoot(page).locator("bld-connector")).toHaveCount(0);
  });

  test("cancels an in-progress link with Escape", async () => {
    await placeBlock(page, "oscilloscope");
    await clickPortHandle(page, "oscilloscope", "output-out");
    await expect(diagramRoot(page).locator('[data-testid="connector-preview"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(diagramRoot(page).locator('[data-testid="connector-preview"]')).toHaveCount(0);
    expect(await statusLinks(page)).toBe("0 links");
  });

  test("wires Oscilloscope → Quantizer → Sin → Timer and opens the chart", async () => {
    for (const id of ["timer", "quantizer", "sin", "cos", "oscilloscope"] as const) {
      await placeBlock(page, id);
    }

    const timerIn = nodeHost(page, "timer").locator('[data-testid="input-in"]');
    await expect(timerIn).toHaveAttribute("title", "c<f64>");
    expect(await timerIn.innerText()).not.toContain("c<f64>");
    const sinIn = nodeHost(page, "sin").locator('[data-testid="input-in"]');
    const sinOut = nodeHost(page, "sin").locator('[data-testid="output-out"]');
    expect(await sinIn.innerText()).not.toContain("c<f64>");
    expect(await sinOut.innerText()).not.toContain("c<f64>");
    await expect(sinOut).toHaveAttribute("title", "c<f64>");
    const cosIn = nodeHost(page, "cos").locator('[data-testid="input-in"]');
    const cosOut = nodeHost(page, "cos").locator('[data-testid="output-out"]');
    expect(await cosIn.innerText()).not.toContain("c<f64>");
    expect(await cosOut.innerText()).not.toContain("c<f64>");
    expect(await portTypeText(page, "timer", "input-in")).toBeNull();
    const timerIcon = nodeHost(page, "timer").locator(".flow-node-icon svg");
    await expect(timerIcon).toBeVisible();
    const glyphNs = await timerIcon.evaluate((svg) => {
      const g = svg.querySelector("path, rect, circle, ellipse");
      return g && g.namespaceURI;
    });
    expect(glyphNs).toBe("http://www.w3.org/2000/svg");

    async function wire(fromDef: string, fromPort: string, toDef: string, toPort: string, expected: string): Promise<void> {
      await clickPortHandle(page, fromDef, `output-${fromPort}`);
      await clickPortHandle(page, toDef, `input-${toPort}`);
      await waitForLinks(page, expected);
    }

    await wire("oscilloscope", "out", "quantizer", "in", "1 link");
    await wire("quantizer", "out", "sin", "in", "2 links");
    await wire("sin", "out", "timer", "in", "3 links");

    const chart = nodeHost(page, "oscilloscope").locator('[data-testid^="chart-"]');
    await expect(chart).toBeDisabled();
    await runDiagram(page);
    const run = page.locator('[data-testid="toolbar-run"]');
    await expect(run).toBeDisabled();
    await expect(chart).toBeEnabled();
    await chart.click();
    await waitDeep(page, '[data-testid="oscilloscope-modal"]');
    await expect(page.locator('[data-testid="oscilloscope-chart"]')).toHaveAttribute("data-series-count", "1");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="oscilloscope-modal"]')).toHaveCount(0);
    await expect.poll(async () => page.locator("bld-connector:not([data-preview])[data-flow]").count()).toBe(3);
    const period = await page.locator("bld-connector:not([data-preview])[data-flow]").first().evaluate((el) => {
      return (el as HTMLElement).style.getPropertyValue("--flow-period");
    });
    expect(period).toMatch(/ms$/);
    await page.locator('[data-testid="toolbar-stop"]').click();
    await expect(run).toBeEnabled();
    await expect(page.locator("bld-connector:not([data-preview])[data-flow]")).toHaveCount(0);
  });

  test("opens a multi-axis chart after two vector channels run", async () => {
    await placeBlock(page, "oscilloscope");
    await placeBlock(page, "sin");
    await placeBlock(page, "cos");
    await placeBlock(page, "timer");
    await clickPortHandle(page, "oscilloscope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "oscilloscope", "output-out");
    await clickPortHandle(page, "cos", "input-in");
    await waitForLinks(page, "2 links");
    await clickPortHandle(page, "sin", "output-out");
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "3 links");
    await clickPortHandle(page, "cos", "output-out");
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "4 links");

    const chart = nodeHost(page, "oscilloscope").locator('[data-testid^="chart-"]');
    await runDiagram(page);
    await expect(chart).toBeEnabled();
    await chart.click();
    await waitDeep(page, '[data-testid="oscilloscope-modal"]');
    await expect(page.locator('[data-testid="oscilloscope-chart"]')).toHaveAttribute("data-series-count", "2");
  });

  test("moves the connector when a wired node is dragged", async () => {
    await placeBlock(page, "oscilloscope");
    await placeBlock(page, "quantizer");
    await clickPortHandle(page, "oscilloscope", "output-out");
    await clickPortHandle(page, "quantizer", "input-in");
    await waitForLinks(page, "1 link");
    const before = await connectorPath(page);
    await dragNodeBy(page, "oscilloscope", 90, 30);
    await expect.poll(async () => connectorPath(page)).not.toBe(before);
  });
});
