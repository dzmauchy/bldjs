import { describe, expect, it } from "vitest";
import { clampInt, clampPositiveInt } from "./numeric";
import { intervalMs } from "./flow";
import { DEFAULT_PERIOD_MS, DEFAULT_PIN, periodMsFrom, pinFrom } from "./blocks/cs/ids";

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

describe("clampInt", () => {
  it("keeps GPIO pin 0 and caps at the high end", () => {
    expect(clampInt(0, 0, 31)).toBe(0);
    expect(clampInt(31.9, 0, 31)).toBe(31);
    expect(clampInt(-2, 0, 31)).toBe(0);
    expect(clampInt(99, 0, 31)).toBe(31);
    expect(pinFrom(undefined)).toBe(DEFAULT_PIN);
    expect(pinFrom("13")).toBe(13);
    expect(pinFrom("-1")).toBe(0);
  });
});
