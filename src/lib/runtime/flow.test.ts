import { describe, expect, it } from "vitest";
import {
  FLOW_PERIOD_MAX_MS,
  FLOW_PERIOD_MIN_MS,
  FLOW_PERIODS_MS,
  FLOW_STYLE_COUNT,
  flowStyleIndex,
  hzFromDelta,
  intervalMs,
} from "./flow";

describe("flow rate", () => {
  it("converts a count delta into hertz", () => {
    expect(hzFromDelta(0, 10, 100)).toBe(100);
    expect(hzFromDelta(4, 14, 20)).toBe(500);
    expect(hzFromDelta(8, 8, 100)).toBe(0);
    expect(hzFromDelta(3, 2, 100)).toBe(0);
    expect(hzFromDelta(0, 5, 0)).toBe(0);
  });

  it("builds 10 logarithmically spaced animation periods", () => {
    expect(FLOW_PERIODS_MS).toHaveLength(FLOW_STYLE_COUNT);
    expect(FLOW_PERIODS_MS[0]).toBe(FLOW_PERIOD_MAX_MS);
    expect(FLOW_PERIODS_MS[FLOW_STYLE_COUNT - 1]).toBe(FLOW_PERIOD_MIN_MS);
    const ratios = [];
    for (let i = 1; i < FLOW_PERIODS_MS.length; i += 1) {
      ratios.push(FLOW_PERIODS_MS[i]! / FLOW_PERIODS_MS[i - 1]!);
    }
    const geo = FLOW_PERIOD_MIN_MS / FLOW_PERIOD_MAX_MS;
    const expected = geo ** (1 / (FLOW_STYLE_COUNT - 1));
    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(expected, 1);
    }
  });

  it("maps frequency onto animating styles 0..9", () => {
    expect(flowStyleIndex(0)).toBeNull();
    expect(flowStyleIndex(0.1)).toBe(0);
    expect(flowStyleIndex(1)).toBe(2);
    expect(flowStyleIndex(10)).toBe(7);
    expect(flowStyleIndex(100)).toBe(9);
  });

  it("clamps generator intervals to at least 1 ms", () => {
    expect(intervalMs(10)).toBe(10);
    expect(intervalMs(0)).toBe(1);
    expect(intervalMs(-4)).toBe(1);
    expect(intervalMs(2.9)).toBe(2);
  });
});
