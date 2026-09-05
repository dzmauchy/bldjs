import { describe, expect, it } from "vitest";
import { clampDouble, clampInt, clampPositiveInt } from "./numeric";
import { intervalMs } from "./flow";
import { DEFAULT_COUNT, DEFAULT_PERIOD_MS, DEFAULT_PIN, DEFAULT_WINDOW_S, DEFAULT_OMEGA, DEFAULT_VALUE, DEFAULT_ZETA, MAX_COUNT, MAX_OMEGA, MAX_VALUE, MAX_ZETA, MIN_COUNT, MIN_OMEGA, MIN_VALUE, MIN_ZETA, countFrom, meterMsFrom, omegaFrom, periodMsFrom, pinFrom, sampleCap, valueFrom, windowSecondsFrom, zetaFrom } from "./blocks/cs/ids";

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
    expect(windowSecondsFrom(undefined)).toBe(DEFAULT_WINDOW_S);
    expect(windowSecondsFrom("5")).toBe(10);
    expect(meterMsFrom("5")).toBe(10);
    expect(sampleCap(30, 10)).toBe(3000);
  });
});

describe("clampDouble", () => {
  it("clamps overshoot ζ and ω without truncating", () => {
    expect(clampDouble(0.5, 0.05, 0.95)).toBe(0.5);
    expect(clampDouble(0.01, MIN_ZETA, MAX_ZETA, DEFAULT_ZETA)).toBe(MIN_ZETA);
    expect(clampDouble(1.2, MIN_ZETA, MAX_ZETA, DEFAULT_ZETA)).toBe(MAX_ZETA);
    expect(clampDouble(Number.NaN, MIN_ZETA, MAX_ZETA, DEFAULT_ZETA)).toBe(DEFAULT_ZETA);
    expect(zetaFrom(undefined)).toBe(DEFAULT_ZETA);
    expect(zetaFrom("0.7")).toBe(0.7);
    expect(zetaFrom("0")).toBe(MIN_ZETA);
    expect(omegaFrom(undefined)).toBe(DEFAULT_OMEGA);
    expect(omegaFrom("2")).toBe(2);
    expect(omegaFrom("0")).toBe(MIN_OMEGA);
    expect(omegaFrom("99")).toBe(MAX_OMEGA);
    expect(valueFrom(undefined)).toBe(DEFAULT_VALUE);
    expect(valueFrom("2.5")).toBe(2.5);
    expect(valueFrom("-200")).toBe(MIN_VALUE);
    expect(valueFrom("200")).toBe(MAX_VALUE);
    expect(countFrom(undefined)).toBe(DEFAULT_COUNT);
    expect(countFrom("4")).toBe(4);
    expect(countFrom("0")).toBe(MIN_COUNT);
    expect(countFrom("99")).toBe(MAX_COUNT);
  });
});
