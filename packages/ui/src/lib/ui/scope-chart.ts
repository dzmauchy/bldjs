import type { ScopeSeries } from "@bld/xml";

/** Chart.js sample palette, kept for the canvas plot. */
export const SCOPE_CHART_COLORS = [
  { border: "rgb(255, 99, 132)", background: "rgba(255, 99, 132, 0.5)" },
  { border: "rgb(54, 162, 235)", background: "rgba(54, 162, 235, 0.5)" },
  { border: "rgb(255, 205, 86)", background: "rgba(255, 205, 86, 0.5)" },
  { border: "rgb(75, 192, 192)", background: "rgba(75, 192, 192, 0.5)" },
  { border: "rgb(153, 102, 255)", background: "rgba(153, 102, 255, 0.5)" },
  { border: "rgb(255, 159, 64)", background: "rgba(255, 159, 64, 0.5)" },
] as const;

const DARK_GRID = "rgba(255, 255, 255, 0.08)";
const DARK_TICK = "#adb5bd";
const PLOT_BG = "#14171a";
const AXIS_GUTTER = 44;
const PLOT_PAD_X = 8;
const PLOT_PAD_TOP = 8;
const PLOT_PAD_BOTTOM = 10;
const LEGEND_HEIGHT = 22;
const FONT = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export type ScopeAxisSide = "left" | "right";

export interface ScopeValueRange {
  min: number;
  max: number;
}

export interface ScopePlotLayout {
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  legend: boolean;
  axes: { side: ScopeAxisSide; x: number }[];
}

export function scopeAxisId(index: number): string {
  return index === 0 ? "y" : `y${index}`;
}

export function scopeAxisSide(index: number): ScopeAxisSide {
  return index % 2 === 0 ? "left" : "right";
}

export function scopeSeriesColor(index: number): (typeof SCOPE_CHART_COLORS)[number] {
  return SCOPE_CHART_COLORS[index % SCOPE_CHART_COLORS.length];
}

export function seriesValueRange(samples: readonly number[]): ScopeValueRange {
  let min = Infinity;
  let max = -Infinity;
  for (const value of samples) {
    if (!Number.isFinite(value)) {
      continue;
    }
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: -1, max: 1 };
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (!(span > 0)) {
    return [min];
  }
  const raw = span / Math.max(count - 1, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / mag;
  const step = residual >= 5 ? 5 * mag : residual >= 2 ? 2 * mag : mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 1e-6; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks.length > 0 ? ticks : [min, max];
}

export function formatTick(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e4 || abs < 0.001)) {
    return value.toExponential(1);
  }
  return String(Number(value.toPrecision(4)));
}

export function scopePlotLayout(width: number, height: number, seriesCount: number): ScopePlotLayout {
  const count = Math.max(seriesCount, 1);
  let leftGutters = 0;
  let rightGutters = 0;
  const axes: ScopePlotLayout["axes"] = [];
  for (let index = 0; index < count; index += 1) {
    const side = scopeAxisSide(index);
    if (side === "left") {
      leftGutters += 1;
      axes.push({ side, x: PLOT_PAD_X + (leftGutters - 1) * AXIS_GUTTER });
    } else {
      rightGutters += 1;
      axes.push({ side, x: width - PLOT_PAD_X - (rightGutters - 1) * AXIS_GUTTER });
    }
  }
  const legend = seriesCount > 1;
  const plotLeft = PLOT_PAD_X + leftGutters * AXIS_GUTTER;
  const plotRight = width - PLOT_PAD_X - rightGutters * AXIS_GUTTER;
  const plotTop = (legend ? LEGEND_HEIGHT : 0) + PLOT_PAD_TOP;
  const plotHeight = Math.max(1, height - plotTop - PLOT_PAD_BOTTOM);
  return {
    plotLeft,
    plotTop,
    plotWidth: Math.max(1, plotRight - plotLeft),
    plotHeight,
    legend,
    axes,
  };
}

export function longestIndexLabels(series: readonly ScopeSeries[]): number[] {
  const length = series.reduce((max, channel) => Math.max(max, channel.samples.length), 0);
  return Array.from({ length }, (_, index) => index);
}

function yOf(value: number, range: ScopeValueRange, layout: ScopePlotLayout): number {
  const span = range.max - range.min || 1;
  const t = (value - range.min) / span;
  return layout.plotTop + (1 - t) * layout.plotHeight;
}

function xOf(index: number, length: number, layout: ScopePlotLayout): number {
  if (length <= 1) {
    return layout.plotLeft;
  }
  return layout.plotLeft + (index / (length - 1)) * layout.plotWidth;
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  width: number,
  series: readonly ScopeSeries[],
): void {
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const items = series.map((channel, index) => {
    const label = channel.label || `ch${index}`;
    return { label, color: scopeSeriesColor(index).border, width: 18 + ctx.measureText(label).width };
  });
  const gap = 16;
  const total = items.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(items.length - 1, 0);
  let x = Math.max(PLOT_PAD_X, (width - total) / 2);
  const y = LEGEND_HEIGHT / 2;
  for (const item of items) {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12, y);
    ctx.stroke();
    ctx.fillStyle = DARK_TICK;
    ctx.fillText(item.label, x + 16, y);
    x += item.width + gap;
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, layout: ScopePlotLayout, ticks: number[], range: ScopeValueRange): void {
  ctx.strokeStyle = DARK_GRID;
  ctx.lineWidth = 1;
  for (const tick of ticks) {
    const y = Math.round(yOf(tick, range, layout)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(layout.plotLeft, y);
    ctx.lineTo(layout.plotLeft + layout.plotWidth, y);
    ctx.stroke();
  }
}

function drawAxis(
  ctx: CanvasRenderingContext2D,
  layout: ScopePlotLayout,
  axis: ScopePlotLayout["axes"][number],
  range: ScopeValueRange,
  ticks: number[],
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  ctx.textAlign = axis.side === "left" ? "right" : "left";
  const axisX = axis.side === "left" ? layout.plotLeft : layout.plotLeft + layout.plotWidth;
  ctx.beginPath();
  ctx.moveTo(axisX + 0.5, layout.plotTop);
  ctx.lineTo(axisX + 0.5, layout.plotTop + layout.plotHeight);
  ctx.stroke();
  const labelX = axis.side === "left" ? axisX - 6 : axisX + 6;
  for (const tick of ticks) {
    const y = Math.round(yOf(tick, range, layout)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(axis.side === "left" ? axisX : axisX - 4, y);
    ctx.lineTo(axis.side === "left" ? axisX + 4 : axisX, y);
    ctx.stroke();
    ctx.fillText(formatTick(tick), labelX, y);
  }
}

function drawSeries(
  ctx: CanvasRenderingContext2D,
  layout: ScopePlotLayout,
  samples: readonly number[],
  range: ScopeValueRange,
  color: string,
): void {
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    if (!Number.isFinite(value)) {
      continue;
    }
    points.push({
      x: xOf(index, Math.max(samples.length, 1), layout),
      y: yOf(value, range, layout),
    });
  }
  if (points.length === 0) {
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y);
  } else {
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
  }
  ctx.stroke();
}

/** Draw a multi-axis line plot into a 2d context sized in CSS pixels. */
export function drawScopePlot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  series: readonly ScopeSeries[] = [],
): void {
  ctx.fillStyle = PLOT_BG;
  ctx.fillRect(0, 0, width, height);
  const layout = scopePlotLayout(width, height, series.length);
  const ranges = series.map((channel) => seriesValueRange(channel.samples));
  const gridRange = ranges[0] ?? { min: -1, max: 1 };
  const gridTicks = niceTicks(gridRange.min, gridRange.max);
  if (layout.legend) {
    drawLegend(ctx, width, series);
  }
  drawGrid(ctx, layout, gridTicks, gridRange);
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plotLeft, layout.plotTop, layout.plotWidth, layout.plotHeight);
  ctx.clip();
  series.forEach((channel, index) => {
    drawSeries(ctx, layout, channel.samples, ranges[index] ?? gridRange, scopeSeriesColor(index).border);
  });
  ctx.restore();
  const axisCount = Math.max(series.length, 1);
  for (let index = 0; index < axisCount; index += 1) {
    const axis = layout.axes[index];
    if (!axis) {
      continue;
    }
    const range = ranges[index] ?? gridRange;
    const color = series.length === 0 ? DARK_TICK : scopeSeriesColor(index).border;
    drawAxis(ctx, layout, axis, range, niceTicks(range.min, range.max), color);
  }
}

export function fitScopeCanvas(canvas: HTMLCanvasElement): { width: number; height: number; dpr: number } | null {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 2 || height < 2) {
    return null;
  }
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }
  return { width, height, dpr };
}

export function paintScopeCanvas(canvas: HTMLCanvasElement, series: readonly ScopeSeries[]): boolean {
  const size = fitScopeCanvas(canvas);
  if (!size) {
    return false;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  drawScopePlot(ctx, size.width, size.height, series);
  return true;
}

/** Owns a live canvas plot: resize until layout exists, then keep redrawing. */
export class ScopeCanvasPlot {
  readonly canvas: HTMLCanvasElement;
  #series: readonly ScopeSeries[] = [];
  #observer: ResizeObserver | null = null;
  #raf: number[] = [];
  #onPaint: ((painted: boolean) => void) | null;

  constructor(canvas: HTMLCanvasElement, onPaint?: (painted: boolean) => void) {
    this.canvas = canvas;
    this.#onPaint = onPaint ?? null;
    this.#observer = new ResizeObserver(() => {
      this.redraw();
    });
    this.#observer.observe(canvas);
    const parent = canvas.parentElement;
    if (parent) {
      this.#observer.observe(parent);
    }
  }

  get seriesCount(): number {
    return this.#series.length;
  }

  setSeries(series: readonly ScopeSeries[]): boolean {
    this.#series = series;
    return this.redraw();
  }

  redraw(): boolean {
    const painted = paintScopeCanvas(this.canvas, this.#series);
    this.#onPaint?.(painted);
    return painted;
  }

  /** Size after layout. Zero-size first paint is why a previous canvas plot never appeared. */
  fit(): void {
    const run = (): void => {
      this.redraw();
    };
    run();
    this.#raf.push(
      requestAnimationFrame(() => {
        run();
        this.#raf.push(requestAnimationFrame(run));
      }),
    );
  }

  destroy(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    for (const id of this.#raf) {
      cancelAnimationFrame(id);
    }
    this.#raf = [];
  }
}
