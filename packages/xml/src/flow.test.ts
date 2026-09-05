import { describe, expect, it } from "vitest";
import {
  FLOW_PERIOD_MAX_MS,
  FLOW_PERIOD_MIN_MS,
  ConnectorIntrospector,
  flowPeriodMs,
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

  it("maps frequency onto a clamped animation period", () => {
    expect(flowPeriodMs(0)).toBeNull();
    expect(flowPeriodMs(0.1)).toBe(FLOW_PERIOD_MAX_MS);
    expect(flowPeriodMs(1)).toBe(1000);
    expect(flowPeriodMs(10)).toBe(FLOW_PERIOD_MIN_MS);
    expect(flowPeriodMs(100)).toBe(FLOW_PERIOD_MIN_MS);
    expect(flowPeriodMs(4)).toBe(250);
  });

  it("clamps generator intervals to at least 1 ms", () => {
    expect(intervalMs(10)).toBe(10);
    expect(intervalMs(0)).toBe(1);
    expect(intervalMs(-4)).toBe(1);
    expect(intervalMs(2.9)).toBe(2);
  });

  it("counts value changes per connector, not repeated samples", () => {
    const tap = new ConnectorIntrospector(2);
    expect(tap.observe(0, 1)).toBe(true);
    expect(tap.observe(0, 1)).toBe(false);
    expect(tap.observe(0, 0)).toBe(true);
    expect(tap.observe(1, 0.5)).toBe(true);
    expect(tap.observe(1, 0.5)).toBe(false);
    expect(tap.observe(-1, 1)).toBe(false);
    expect(tap.observe(2, 1)).toBe(false);
    expect(tap.observe(0, Number.NaN)).toBe(true);
    expect(tap.observe(0, Number.NaN)).toBe(false);
  });
});
