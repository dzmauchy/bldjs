import { describe, expect, it } from "vitest";
import { buildScopeChartConfig, scopeAxisId, scopeChartDatasets, scopeChartScales } from "./scope-chart";

describe("scope multi-axis chart", () => {
  it("assigns each series its own y-axis id like the Chart.js multi-axis sample", () => {
    expect(scopeAxisId(0)).toBe("y");
    expect(scopeAxisId(1)).toBe("y1");
    const datasets = scopeChartDatasets([
      { label: "sin", samples: [0, 1] },
      { label: "cos", samples: [1, 0] },
    ]);
    expect(datasets).toHaveLength(2);
    expect(datasets[0]).toMatchObject({
      label: "sin",
      yAxisID: "y",
      borderColor: "rgb(255, 99, 132)",
    });
    expect(datasets[1]).toMatchObject({
      label: "cos",
      yAxisID: "y1",
      borderColor: "rgb(54, 162, 235)",
    });
  });

  it("puts the second axis on the right without drawing a second grid", () => {
    const scales = scopeChartScales(2)!;
    expect(scales.y).toMatchObject({ type: "linear", display: true, position: "left" });
    expect(scales.y1).toMatchObject({
      type: "linear",
      display: true,
      position: "right",
      grid: { drawOnChartArea: false },
    });
  });

  it("builds a Chart.js multi-axis line config", () => {
    const config = buildScopeChartConfig([
      { label: "sin", samples: [0, 1] },
      { label: "cos", samples: [1, -1] },
    ]);
    expect(config.type).toBe("line");
    expect(config.data.labels).toEqual([0, 1]);
    expect(config.data.datasets).toHaveLength(2);
    expect(config.options?.animation).toBe(false);
    expect(config.options?.resizeDelay).toBe(0);
    expect(config.options?.interaction).toEqual({ mode: "index", intersect: false });
    expect(config.options?.scales?.y).toMatchObject({ stacked: false, position: "left" });
    expect(config.options?.plugins?.title?.display).toBe(false);
    expect(config.options?.plugins?.legend?.display).toBe(true);
    expect(config.options?.scales?.y1).toBeDefined();
  });
});
