import { describe, expect, it, vi } from "vitest";
import {
  drawScopePlot,
  fitScopeCanvas,
  formatTick,
  niceTicks,
  paintScopeCanvas,
  SCOPE_CHART_HEIGHT,
  SCOPE_CHART_MAX_WIDTH,
  SCOPE_SCALE_SHRINK_DELAY_MS,
  scopeAxisId,
  scopeAxisSide,
  scopePlotLayout,
  scopeSeriesColor,
  seriesValueRange,
  ScopeCanvasPlot,
  ScopeScaleTracker,
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

  it("scales the range between Ymin - 0.1*(Ymax-Ymin) and Ymax + 0.1*(Ymax-Ymin)", () => {
    expect(seriesValueRange([0, 10])).toEqual({ min: -1, max: 11 });
    expect(seriesValueRange([-5, 5])).toEqual({ min: -6, max: 6 });
    expect(seriesValueRange([1, 2])).toEqual({ min: 0.9, max: 2.1 });
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

  it("strokes a right-aligned series at the end of a fixed-length NaN window", () => {
    const ctx = recordingContext();
    const samples = Array.from({ length: 64 }, () => Number.NaN);
    samples[62] = 0;
    samples[63] = 1;
    drawScopePlot(ctx, 640, 280, [{ label: "ch", samples }]);
    const clipAt = ctx.calls.findIndex((call) => call.name === "clip");
    const afterClip = ctx.calls.slice(clipAt);
    const move = afterClip.find((call) => call.name === "moveTo");
    const line = afterClip.find((call) => call.name === "lineTo");
    expect(move).toBeDefined();
    expect(line).toBeDefined();
    expect(move!.args[0] as number).toBeGreaterThan(400);
    expect(line!.args[0] as number).toBeGreaterThan(move!.args[0] as number);
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

  it("expands range axis immediately and shrinks with a 10s delay after signal changes", () => {
    const tracker = new ScopeScaleTracker();
    expect(tracker.delayMs).toBe(SCOPE_SCALE_SHRINK_DELAY_MS);
    expect(tracker.delayMs).toBe(10_000);

    // Initial signal: [0, 10] -> range [-1, 11]
    const r0 = tracker.update([{ label: "sig", samples: [0, 10] }], 1000);
    expect(r0).toEqual([{ min: -1, max: 11 }]);

    // Signal expands to [0, 20] at t = 2000 -> expands immediately to [-2, 22]
    const r1 = tracker.update([{ label: "sig", samples: [0, 20] }], 2000);
    expect(r1).toEqual([{ min: -2, max: 22 }]);

    // Signal shrinks to [1, 2] at t = 3000 -> held at [-2, 22]
    const r2 = tracker.update([{ label: "sig", samples: [1, 2] }], 3000);
    expect(r2).toEqual([{ min: -2, max: 22 }]);

    // At t = 11999 (9.999s after t = 2000) -> still held at [-2, 22]
    const r3 = tracker.update([{ label: "sig", samples: [1, 2] }], 11999);
    expect(r3).toEqual([{ min: -2, max: 22 }]);

    // At t = 12001 (10.001s after t = 2000) -> 20 expired! Shrinks to [0.9, 2.1]
    const r4 = tracker.update([{ label: "sig", samples: [1, 2] }], 12001);
    expect(r4[0].min).toBeCloseTo(0.9, 5);
    expect(r4[0].max).toBeCloseTo(2.1, 5);
  });

  it("tracks independent scales per channel and resets on reset()", () => {
    const tracker = new ScopeScaleTracker(5000);
    const seriesA = [
      { label: "ch0", samples: [0, 10] },
      { label: "ch1", samples: [-100, 100] },
    ];
    const r0 = tracker.update(seriesA, 0);
    expect(r0).toEqual([
      { min: -1, max: 11 },
      { min: -120, max: 120 },
    ]);

    // Discards idle fallbacks when real data arrives
    const idleTracker = new ScopeScaleTracker();
    const idle0 = idleTracker.update([{ label: "s", samples: [] }], 0);
    expect(idle0).toEqual([{ min: -1, max: 1 }]);
    const idle1 = idleTracker.update([{ label: "s", samples: [100, 105] }], 100);
    expect(idle1[0].min).toBeCloseTo(99.5, 5);
    expect(idle1[0].max).toBeCloseTo(105.5, 5);

    // Reset clears history
    idleTracker.reset();
    expect(idleTracker.ranges).toEqual([]);
  });

  it("ScopeCanvasPlot tracks scales and resets scales on resetScales()", () => {
    const canvas = document.createElement("canvas");
    const parent = document.createElement("div");
    parent.append(canvas);
    const ctx = recordingContext();
    Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => 280 });
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx);

    const plot = new ScopeCanvasPlot(canvas);
    plot.setSeries([{ label: "v", samples: [0, 10] }], 0);
    expect(plot.scaleTracker.ranges).toEqual([{ min: -1, max: 11 }]);

    plot.setSeries([{ label: "v", samples: [1, 2] }], 1000);
    expect(plot.scaleTracker.ranges).toEqual([{ min: -1, max: 11 }]);

    plot.resetScales();
    expect(plot.scaleTracker.ranges).toEqual([]);
    plot.destroy();
  });
});
