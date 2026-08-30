import { describe, expect, it } from "vitest";
import { flowPeriodMs, hzFromDelta, intervalMs } from "./flow";

describe("flow rate", () => {
  it("converts a count delta into hertz", () => {
    expect(hzFromDelta(0, 10, 100)).toBe(100);
    expect(hzFromDelta(4, 14, 20)).toBe(500);
    expect(hzFromDelta(8, 8, 100)).toBe(0);
    expect(hzFromDelta(3, 2, 100)).toBe(0);
    expect(hzFromDelta(0, 5, 0)).toBe(0);
  });

  it("maps frequency onto a dashed-line animation period", () => {
    expect(flowPeriodMs(0)).toBe(0);
    expect(flowPeriodMs(1)).toBe(1000);
    expect(flowPeriodMs(10)).toBe(100);
    expect(flowPeriodMs(100)).toBe(40);
    expect(flowPeriodMs(0.1)).toBe(2500);
  });

  it("clamps generator intervals to at least 1 ms", () => {
    expect(intervalMs(10)).toBe(10);
    expect(intervalMs(0)).toBe(1);
    expect(intervalMs(-4)).toBe(1);
    expect(intervalMs(2.9)).toBe(2);
  });
});
