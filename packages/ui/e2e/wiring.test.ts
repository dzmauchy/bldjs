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
  scopeChartHasInk,
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
    await placeBlock(page, "scope");
    await placeBlock(page, "sin");
    await placeBlock(page, "timer");
    expect(await portTypeText(page, "scope", "output-out")).toBeNull();
    expect(await portTypeText(page, "sin", "input-in")).toBeNull();
    expect(await portTypeText(page, "sin", "output-out")).toBeNull();
    expect(await portTypeText(page, "timer", "input-in")).toBeNull();

    const scopeBox = await boxOf(nodeHost(page, "scope"));
    const sinBox = await boxOf(nodeHost(page, "sin"));
    const timerBox = await boxOf(nodeHost(page, "timer"));

    await clickPortHandle(page, "scope", "output-out");
    await expect
      .poll(async () => portTypeText(page, "scope", "output-out"))
      .toBe("c<f64>");
    expect(await portTypeText(page, "sin", "input-in")).toBe("c<f64>");
    expect(await portTypeText(page, "timer", "input-in")).toBe("c<f64>");
    expect(await portTypeText(page, "sin", "output-out")).toBeNull();

    const scopeAfter = await boxOf(nodeHost(page, "scope"));
    const sinAfter = await boxOf(nodeHost(page, "sin"));
    const timerAfter = await boxOf(nodeHost(page, "timer"));
    expect(scopeAfter.width).toBe(scopeBox.width);
    expect(scopeAfter.height).toBe(scopeBox.height);
    expect(sinAfter.width).toBe(sinBox.width);
    expect(sinAfter.height).toBe(sinBox.height);
    expect(timerAfter.width).toBe(timerBox.width);
    expect(timerAfter.height).toBe(timerBox.height);

    const outHandle = await boxOf(nodeHost(page, "scope").locator('[data-testid="output-out"] [data-handle]'));
    const outType = nodeHost(page, "scope").locator('[data-testid="output-out-type"]');
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

    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    await waitForAvoidRouter(page);
    expect(await portTypeText(page, "scope", "output-out")).toBeNull();
    expect(await portTypeText(page, "sin", "input-in")).toBeNull();
    expect(await portTypeText(page, "timer", "input-in")).toBeNull();

    const path = await connectorPath(page);
    expect(path.startsWith("polygon(")).toBe(true);
    expect((await diagramCss(page, "bld-connector").evaluate((el) => el.tagName)).toLowerCase()).toBe("bld-connector");
    const diagram = await waitDeep(page, "bld-diagram");
    await expect(diagram).toHaveAttribute("data-connector", "jumpover");
    await expect(diagram).toHaveAttribute("data-worker", "true");
  });

  test("keeps a second c<f64> wire on the same input", async () => {
    await placeBlock(page, "scope");
    await placeBlock(page, "scope");
    await placeBlock(page, "timer");
    await clickPortHandle(page, "scope", "output-out", 0);
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "scope", "output-out", 1);
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "2 links");
  });

  test("adds extra ports for a second wire and removes them with the connector", async () => {
    await placeBlock(page, "scope");
    await placeBlock(page, "sin");
    await placeBlock(page, "cos");

    async function portNames(defId: string, side: "in" | "out"): Promise<string[]> {
      return nodeHost(page, defId)
        .locator(`[data-port][data-side="${side}"]`)
        .evaluateAll((ports) => ports.map((port) => port.getAttribute("data-name") ?? ""));
    }

    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    expect(await portNames("scope", "out")).toEqual(["out"]);
    expect(await portNames("sin", "in")).toEqual(["in"]);
    const scope = nodeHost(page, "scope");
    await expect(scope.locator('[data-vector="out"] .block-port-vector-rail')).toHaveCount(1);
    await expect(scope.locator('[data-vector="out"] .block-port-name')).toHaveCount(0);

    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "cos", "input-in");
    await waitForLinks(page, "2 links");
    expect(await portNames("scope", "out")).toEqual(["out", "out[1]"]);
    expect(await portNames("cos", "in")).toEqual(["in"]);
    await expect(scope.locator('[data-vector="out"] [data-handle]')).toHaveCount(2);
    await expect(scope.locator('[data-vector="out"] .block-port-name')).toHaveCount(0);
    await expect(scope.locator('[data-testid="output-out"]')).toHaveAttribute("title", "c<f64>");
    await expect(scope.locator('[data-testid="output-out[1]"]')).toHaveAttribute("title", "c<f64>");
    await clickPortHandle(page, "scope", "output-out");
    await expect.poll(async () => portTypeText(page, "scope", "output-out")).toBe("c<f64>");
    await page.keyboard.press("Escape");
    await expect(diagramRoot(page).locator('[data-testid="connector-preview"]')).toHaveCount(0);
    expect(await portTypeText(page, "scope", "output-out")).toBeNull();

    await clickPortHandle(page, "scope", "output-out[1]");
    await clickPortHandle(page, "cos", "input-in");
    await waitForLinks(page, "1 link");
    expect(await portNames("scope", "out")).toEqual(["out"]);
  });

  test("keeps two inputs on distinct connector approaches", async () => {
    await placeBlock(page, "scope");
    await placeBlock(page, "scope");
    await placeBlock(page, "timer");

    const upperBox = await boxOf(nodeHost(page, "scope", 0));
    const lowerBox = await boxOf(nodeHost(page, "scope", 1));
    const timerBox = await boxOf(nodeHost(page, "timer"));
    await dragNodeBy(page, "scope", upperBox.x - lowerBox.x, upperBox.y + upperBox.height + 36 - lowerBox.y, 1);
    await dragNodeBy(page, "timer", upperBox.x + upperBox.width + 96 - timerBox.x, upperBox.y - timerBox.y);

    await clickPortHandle(page, "scope", "output-out", 0);
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "scope", "output-out", 1);
    await clickPortHandle(page, "timer", "input-in");
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

  test("inserts a new input above when the new source is above", async () => {
    await placeBlock(page, "scope");
    await placeBlock(page, "scope");
    await placeBlock(page, "timer");

    const upperBox = await boxOf(nodeHost(page, "scope", 0));
    const lowerBox = await boxOf(nodeHost(page, "scope", 1));
    const timerBox = await boxOf(nodeHost(page, "timer"));
    await dragNodeBy(page, "scope", upperBox.x - lowerBox.x, upperBox.y + upperBox.height + 36 - lowerBox.y, 1);
    await dragNodeBy(page, "timer", upperBox.x + upperBox.width + 96 - timerBox.x, upperBox.y - timerBox.y);

    await clickPortHandle(page, "scope", "output-out", 1);
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "scope", "output-out", 0);
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "2 links");

    const lowerId = await nodeHost(page, "scope", 1).getAttribute("data-block-id");
    const upperId = await nodeHost(page, "scope", 0).getAttribute("data-block-id");
    const timerId = await nodeHost(page, "timer").getAttribute("data-block-id");
    const links = await page.locator("bld-connector[data-link]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-link") ?? ""),
    );
    expect(links.sort()).toEqual([`${upperId}:out->${timerId}:in`, `${lowerId}:out->${timerId}:in[1]`].sort());
  });

  test("toggles the same wire off", async () => {
    await placeBlock(page, "scope");
    await placeBlock(page, "sin");
    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "0 links");
  });

  test("deletes a selected connector", async () => {
    await placeBlock(page, "scope");
    await placeBlock(page, "sin");
    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    await clickConnector(page);
    await pressDelete(page);
    await waitForLinks(page, "0 links");
    await expect(diagramRoot(page).locator("bld-connector")).toHaveCount(0);
  });

  test("cancels an in-progress link with Escape", async () => {
    await placeBlock(page, "scope");
    await clickPortHandle(page, "scope", "output-out");
    await expect(diagramRoot(page).locator('[data-testid="connector-preview"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(diagramRoot(page).locator('[data-testid="connector-preview"]')).toHaveCount(0);
    expect(await statusLinks(page)).toBe("0 links");
  });

  test("wires Scope → Sin and opens the chart", async () => {
    for (const id of ["timer", "sin", "cos", "random", "scope"] as const) {
      await placeBlock(page, id);
    }

    const timerIn = nodeHost(page, "timer").locator('[data-testid="input-in"]');
    await expect(timerIn).toHaveAttribute("title", "c<f64>");
    expect(await timerIn.innerText()).not.toContain("c<f64>");
    await expect(nodeHost(page, "scope").locator('[data-testid="output-out"]')).toHaveAttribute("title", "c<f64>");
    const sinIn = nodeHost(page, "sin").locator('[data-testid="input-in"]');
    expect(await sinIn.innerText()).not.toContain("c<f64>");
    await expect(sinIn).toHaveAttribute("title", "c<f64>");
    await expect(nodeHost(page, "sin").locator('[data-testid="output-out"]')).toHaveAttribute("title", "c<f64>");
    const cosIn = nodeHost(page, "cos").locator('[data-testid="input-in"]');
    expect(await cosIn.innerText()).not.toContain("c<f64>");
    await expect(cosIn).toHaveAttribute("title", "c<f64>");
    await expect(nodeHost(page, "cos").locator('[data-testid="output-out"]')).toHaveAttribute("title", "c<f64>");
    expect(await portTypeText(page, "timer", "input-in")).toBeNull();
    const timerIcon = nodeHost(page, "timer").locator(".flow-node-icon svg");
    await expect(timerIcon).toBeVisible();
    const glyphNs = await timerIcon.evaluate((svg) => {
      const g = svg.querySelector("path, rect, circle, ellipse");
      return g && g.namespaceURI;
    });
    expect(glyphNs).toBe("http://www.w3.org/2000/svg");

    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "sin", "output-out");
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "2 links");

    const chart = nodeHost(page, "scope").locator('[data-testid^="chart-"]');
    await expect(chart).toBeDisabled();
    await page.locator('[data-testid="toolbar-run"]').click();
    await expect(chart).toBeEnabled({ timeout: 2_000 });
    await expect
      .poll(async () => page.locator("bld-connector:not([data-preview])[data-flow]").count(), { timeout: 2_000 })
      .toBe(2);
    await expect(page.locator('[data-testid="status-run"]')).toHaveText("Running", { timeout: 15_000 });
    const stop = page.locator('[data-testid="toolbar-stop"]');
    await expect(page.locator('[data-testid="toolbar-run"]')).toHaveCount(0);
    await expect(stop).toHaveAttribute("title", "Stop");
    await expect(stop).toHaveAttribute("aria-label", "Stop");
    await expect(chart).toBeEnabled();
    await chart.click();
    await waitDeep(page, '[data-testid="scope-modal"]');
    await expect(page.locator('[data-testid="scope-modal"] .modal-title')).toHaveCount(0);
    await expect(page.locator('[data-testid="scope-caption"]')).toHaveText("blk_5");
    await expect(page.locator('[data-testid="scope-caption"]')).not.toContainText("timer(");
    await expect(page.locator('[data-testid="scope-close"]')).toBeVisible();
    await expect(page.locator('[data-testid="scope-chart"]')).toHaveAttribute("data-series-count", "1", {
      timeout: 1_000,
    });
    await expect(page.locator('[data-testid="scope-chart"] canvas')).toBeVisible();
    await expect(page.locator('[data-testid="scope-chart"]')).toHaveAttribute("data-painted", "true", {
      timeout: 1_000,
    });
    await expect
      .poll(async () => Number(await page.locator('[data-testid="scope-chart"]').getAttribute("data-sample-count")), {
        timeout: 2_000,
      })
      .toBeGreaterThan(1);
    await expect
      .poll(async () => {
        const box = await page.locator('[data-testid="scope-chart"]').boundingBox();
        return box?.width ?? 0;
      }, { timeout: 1_000 })
      .toBeGreaterThan(100);
    await expect.poll(async () => scopeChartHasInk(page), { timeout: 2_000 }).toBe(true);
    await page.locator('[data-testid="scope-close"]').click();
    await expect(page.locator('[data-testid="scope-modal"]')).toHaveCount(0);
    await expect.poll(async () => page.locator("bld-connector:not([data-preview])[data-flow]").count()).toBe(2);
    const duration = await page.locator("bld-connector:not([data-preview])[data-flow]").first().evaluate((el) => {
      return getComputedStyle(el).getPropertyValue("--flow-period").trim();
    });
    expect(duration).toMatch(/^\d+(\.\d+)?(s|ms)$/);
    const periodMs = Number.parseFloat(duration);
    expect(periodMs).toBeGreaterThanOrEqual(200);
    expect(periodMs).toBeLessThanOrEqual(2500);
    const flow = page.locator("bld-connector:not([data-preview])[data-flow]");
    await expect(flow).toHaveCount(2);
    const directions = await flow.evaluateAll((els) =>
      els.map((el) => {
        const push = el.hasAttribute("data-push");
        const seg = el.shadowRoot?.querySelector(".seg");
        return {
          push,
          direction: seg ? getComputedStyle(seg).animationDirection : "",
        };
      }),
    );
    expect(directions).toEqual([
      { push: true, direction: "reverse" },
      { push: true, direction: "reverse" },
    ]);
    await page.locator('[data-testid="toolbar-stop"]').click();
    await expect(page.locator('[data-testid="toolbar-run"]')).toBeEnabled();
    await expect(page.locator("bld-connector:not([data-preview])[data-flow]")).toHaveCount(0);
  });

  test("opens a multi-axis chart after two vector channels run", async () => {
    await placeBlock(page, "scope");
    await placeBlock(page, "sin");
    await placeBlock(page, "cos");
    await placeBlock(page, "timer");
    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "cos", "input-in");
    await waitForLinks(page, "2 links");
    await clickPortHandle(page, "sin", "output-out");
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "3 links");
    await clickPortHandle(page, "cos", "output-out");
    await clickPortHandle(page, "timer", "input-in");
    await waitForLinks(page, "4 links");

    const chart = nodeHost(page, "scope").locator('[data-testid^="chart-"]');
    await runDiagram(page);
    await expect(chart).toBeEnabled();
    await chart.click();
    await waitDeep(page, '[data-testid="scope-modal"]');
    await expect(page.locator('[data-testid="scope-modal"] .modal-title')).toHaveCount(0);
    await expect(page.locator('[data-testid="scope-caption"]')).toHaveText("blk_1");
    await expect(page.locator('[data-testid="scope-caption"]')).not.toContainText("timer(");
    await expect(page.locator('[data-testid="scope-close"]')).toBeVisible();
    await expect(page.locator('[data-testid="scope-chart"]')).toHaveAttribute("data-series-count", "2", {
      timeout: 1_000,
    });
    await expect(page.locator('[data-testid="scope-chart"] canvas')).toBeVisible();
    await expect(page.locator('[data-testid="scope-chart"]')).toHaveAttribute("data-painted", "true", {
      timeout: 1_000,
    });
    await expect
      .poll(async () => Number(await page.locator('[data-testid="scope-chart"]').getAttribute("data-sample-count")), {
        timeout: 2_000,
      })
      .toBeGreaterThan(1);
    await expect.poll(async () => scopeChartHasInk(page), { timeout: 2_000 }).toBe(true);
  });

  test("moves the connector when a wired node is dragged", async () => {
    await placeBlock(page, "scope");
    await placeBlock(page, "sin");
    await clickPortHandle(page, "scope", "output-out");
    await clickPortHandle(page, "sin", "input-in");
    await waitForLinks(page, "1 link");
    const before = await connectorPath(page);
    await dragNodeBy(page, "scope", 90, 30);
    await expect.poll(async () => connectorPath(page)).not.toBe(before);
  });
});
