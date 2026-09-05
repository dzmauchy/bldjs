import { describe, expect, it, vi } from "vitest";
import {
  drawScopePlot,
  fitScopeCanvas,
  formatTick,
  niceTicks,
  paintScopeCanvas,
  SCOPE_CHART_HEIGHT,
  SCOPE_CHART_MAX_WIDTH,
  scopeAxisId,
  scopeAxisSide,
  scopePlotLayout,
  scopeSeriesColor,
  seriesValueRange,
  ScopeCanvasPlot,
} from "./scope-chart";

type CtxCall = { name: string; args: unknown[] };

function recordingContext(): CanvasRenderingContext2D & { calls: CtxCall[] } {
  const calls: CtxCall[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
    };
  return {
    calls,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "",
    lineCap: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect: rec("fillRect"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke"),
    fillText: rec("fillText"),
    save: rec("save"),
    restore: rec("restore"),
    rect: rec("rect"),
    clip: rec("clip"),
    setTransform: rec("setTransform"),
    measureText: (text: string) => ({ width: text.length * 6 }) as TextMetrics,
  } as unknown as CanvasRenderingContext2D & { calls: CtxCall[] };
}

describe("scope multi-axis canvas plot", () => {
  it("assigns each series a y-axis id and alternating side", () => {
    expect(scopeAxisId(0)).toBe("y");
    expect(scopeAxisId(1)).toBe("y1");
    expect(scopeAxisSide(0)).toBe("left");
    expect(scopeAxisSide(1)).toBe("right");
    expect(scopeSeriesColor(0).border).toBe("rgb(255, 99, 132)");
    expect(scopeSeriesColor(1).border).toBe("rgb(54, 162, 235)");
  });

  it("puts the second axis on the right and reserves gutters", () => {
    const layout = scopePlotLayout(640, 280, 2);
    expect(layout.legend).toBe(true);
    expect(layout.axes).toHaveLength(2);
    expect(layout.axes[0]).toMatchObject({ side: "left" });
    expect(layout.axes[1]).toMatchObject({ side: "right" });
    expect(layout.plotLeft).toBeGreaterThan(40);
    expect(layout.plotLeft + layout.plotWidth).toBeLessThan(640 - 40);
  });

  it("pads a constant series so the axis still has a span", () => {
    expect(seriesValueRange([2, 2, 2])).toEqual({ min: 1.8, max: 2.2 });
    expect(seriesValueRange([])).toEqual({ min: -1, max: 1 });
    expect(seriesValueRange([Number.NaN])).toEqual({ min: -1, max: 1 });
  });

  it("builds even ticks across a range", () => {
    const ticks = niceTicks(-1, 1, 5);
    expect(ticks[0]).toBeLessThanOrEqual(-1 + 0.5);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(0.5);
    expect(formatTick(0.25)).toBe("0.25");
    expect(formatTick(1e6)).toBe("1.0e+6");
  });

  it("fills the plot and strokes one path per series", () => {
    const ctx = recordingContext();
    drawScopePlot(ctx, 640, 280, [
      { label: "sin", samples: [0, 1, 0, -1] },
      { label: "cos", samples: [1, 0, -1, 0] },
    ]);
    expect(ctx.calls.some((call) => call.name === "fillRect")).toBe(true);
    const strokes = ctx.calls.filter((call) => call.name === "stroke");
    expect(strokes.length).toBeGreaterThan(2);
    const labels = ctx.calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    expect(labels).toContain("sin");
    expect(labels).toContain("cos");
    expect(ctx.calls.some((call) => call.name === "clip")).toBe(true);
  });

  it("does not stroke NaN samples and breaks the path across gaps", () => {
    const nanOnly = recordingContext();
    drawScopePlot(nanOnly, 640, 280, [{ label: "idle", samples: [Number.NaN, Number.NaN] }]);
    const nanSeriesStrokes = nanOnly.calls.filter((call) => call.name === "stroke").length;
    const finite = recordingContext();
    drawScopePlot(finite, 640, 280, [{ label: "idle", samples: [0, 1] }]);
    expect(finite.calls.filter((call) => call.name === "stroke").length).toBeGreaterThan(nanSeriesStrokes);

    const gapped = recordingContext();
    drawScopePlot(gapped, 640, 280, [{ label: "ch", samples: [1, Number.NaN, 2] }]);
    const clipAt = gapped.calls.findIndex((call) => call.name === "clip");
    const afterClip = gapped.calls.slice(clipAt);
    expect(afterClip.filter((call) => call.name === "moveTo").length).toBeGreaterThanOrEqual(2);
  });

  it("still paints axes when there are no samples yet", () => {
    const ctx = recordingContext();
    drawScopePlot(ctx, 400, 200, []);
    expect(ctx.calls.some((call) => call.name === "fillRect")).toBe(true);
    expect(ctx.calls.some((call) => call.name === "stroke")).toBe(true);
  });

  it("does not size a canvas before layout, then paints once it has a box", () => {
    const canvas = document.createElement("canvas");
    const ctx = recordingContext();
    Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => 0 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => 0 });
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx);
    expect(fitScopeCanvas(canvas)).toBeNull();
    expect(paintScopeCanvas(canvas, [{ label: "sin", samples: [0, 1] }])).toBe(false);
    expect(ctx.calls).toEqual([]);

    Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => 280 });
    expect(paintScopeCanvas(canvas, [{ label: "sin", samples: [0, 1] }])).toBe(true);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(280);
    expect(ctx.calls.some((call) => call.name === "setTransform")).toBe(true);
    expect(ctx.calls.some((call) => call.name === "fillRect")).toBe(true);
  });

  it("paints from the parent box when the canvas is still 0×0", () => {
    const parent = document.createElement("div");
    const canvas = document.createElement("canvas");
    parent.append(canvas);
    const ctx = recordingContext();
    Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => 0 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => 0 });
    Object.defineProperty(parent, "clientWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(parent, "clientHeight", { configurable: true, get: () => 280 });
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx);
    expect(paintScopeCanvas(canvas, [{ label: "sin", samples: [0, 1] }])).toBe(true);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(280);
    expect(ctx.calls.some((call) => call.name === "fillRect")).toBe(true);
  });

  it("retries a live plot after layout so the first zero-size paint is not the last", () => {
    const canvas = document.createElement("canvas");
    const parent = document.createElement("div");
    parent.append(canvas);
    const ctx = recordingContext();
    let width = 0;
    Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => width });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => (width === 0 ? 0 : 280) });
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx);
    const plot = new ScopeCanvasPlot(canvas);
    plot.setSeries([{ label: "sin", samples: [0, 1, 0] }]);
    expect(plot.redraw()).toBe(false);
    width = 640;
    expect(plot.redraw()).toBe(true);
    expect(plot.seriesCount).toBe(1);
    plot.destroy();
  });

  it("paints a connected canvas from a fallback size when layout is still 0×0", () => {
    const parent = document.createElement("div");
    const canvas = document.createElement("canvas");
    parent.append(canvas);
    document.body.append(parent);
    try {
      const ctx = recordingContext();
      Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => 0 });
      Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => 0 });
      Object.defineProperty(parent, "clientWidth", { configurable: true, get: () => 0 });
      Object.defineProperty(parent, "clientHeight", { configurable: true, get: () => 0 });
      vi.spyOn(parent, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0));
      vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0));
      vi.spyOn(canvas, "getContext").mockReturnValue(ctx);
      expect(paintScopeCanvas(canvas, [{ label: "sin", samples: [0, 1] }])).toBe(true);
      expect(canvas.width).toBe(Math.min(SCOPE_CHART_MAX_WIDTH, window.innerWidth - 32));
      expect(canvas.height).toBe(SCOPE_CHART_HEIGHT);
      expect(ctx.calls.some((call) => call.name === "fillRect")).toBe(true);
    } finally {
      parent.remove();
    }
  });
});
