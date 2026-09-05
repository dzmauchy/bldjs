import { describe, expect, it } from "vitest";
import { clampPositiveInt } from "./numeric";
import { intervalMs } from "./flow";
import { DEFAULT_PERIOD_MS, periodMsFrom } from "./blocks/cs/ids";

describe("clampPositiveInt", () => {
  it("truncates and floors at 1", () => {
    expect(clampPositiveInt(10.9)).toBe(10);
    expect(clampPositiveInt(0)).toBe(1);
    expect(clampPositiveInt(-4)).toBe(1);
    expect(clampPositiveInt(Number.NaN, 7)).toBe(7);
  });

  it("is shared by period and interval helpers", () => {
    expect(periodMsFrom(undefined)).toBe(DEFAULT_PERIOD_MS);
    expect(periodMsFrom("0")).toBe(1);
    expect(intervalMs(Number.NaN)).toBe(1);
    expect(intervalMs(2.8)).toBe(2);
  });
});
