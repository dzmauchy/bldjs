import type { ChartConfiguration, ChartDataset } from "chart.js";
import type { ScopeSeries } from "$lib/blocks";

/** Chart.js sample palette: https://www.chartjs.org/docs/latest/samples/line/multi-axis.html */
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

export function scopeAxisId(index: number): string {
  return index === 0 ? "y" : `y${index}`;
}

export function scopeChartDatasets(series: readonly ScopeSeries[]): ChartDataset<"line", number[]>[] {
  return series.map((channel, index) => {
    const color = SCOPE_CHART_COLORS[index % SCOPE_CHART_COLORS.length];
    return {
      label: channel.label,
      data: channel.samples,
      borderColor: color.border,
      backgroundColor: color.background,
      yAxisID: scopeAxisId(index),
      pointRadius: 0,
      borderWidth: 1.8,
      tension: 0.25,
      spanGaps: true,
    };
  });
}

export function scopeChartScales(seriesCount: number): NonNullable<ChartConfiguration<"line">["options"]>["scales"] {
  const scales: NonNullable<ChartConfiguration<"line">["options"]>["scales"] = {
    x: {
      display: false,
      grid: { color: DARK_GRID },
    },
    y: {
      type: "linear",
      display: true,
      position: "left",
      stacked: false,
      grid: { color: DARK_GRID },
      border: { color: DARK_GRID },
      ticks: { color: DARK_TICK, maxTicksLimit: 6 },
    },
  };
  for (let index = 1; index < seriesCount; index += 1) {
    scales![scopeAxisId(index)] = {
      type: "linear",
      display: true,
      position: index % 2 === 0 ? "left" : "right",
      stacked: false,
      grid: { drawOnChartArea: false, color: DARK_GRID },
      border: { color: DARK_GRID },
      ticks: { color: DARK_TICK, maxTicksLimit: 6 },
    };
  }
  return scales;
}

/** Chart.js multi-axis line chart: https://www.chartjs.org/docs/latest/samples/line/multi-axis.html */
export function buildScopeChartConfig(series: readonly ScopeSeries[] = []): ChartConfiguration<"line"> {
  const labels = longestIndexLabels(series);
  return {
    type: "line",
    data: {
      labels,
      datasets: scopeChartDatasets(series),
    },
    options: {
      animation: false,
      responsive: true,
      resizeDelay: 0,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      color: DARK_TICK,
      font: { family: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
      plugins: {
        title: {
          display: true,
          text: "Scope — Multi Axis",
          color: DARK_TICK,
        },
        legend: {
          display: series.length > 1,
          labels: { color: DARK_TICK },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "#1c2125",
          titleColor: "#f8f9fa",
          bodyColor: "#0dcaf0",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
        },
      },
      scales: scopeChartScales(Math.max(series.length, 1)),
    },
  };
}

export function longestIndexLabels(series: readonly ScopeSeries[]): number[] {
  const length = series.reduce((max, channel) => Math.max(max, channel.samples.length), 0);
  return Array.from({ length }, (_, index) => index);
}
