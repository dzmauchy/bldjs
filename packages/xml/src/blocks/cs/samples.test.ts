import { describe, expect, it } from "vitest";
import {
  DEFAULT_METER_MS,
  DEFAULT_WINDOW_S,
  MAX_METER_MS,
  MAX_WINDOW_S,
  MIN_METER_MS,
  MIN_WINDOW_S,
  meterMsFrom,
  sampleCap,
  windowSecondsFrom,
} from "./ids";
import { SampleBuf, WindowBuf } from "./samples";

describe("scope window", () => {
  it("clamps N seconds and M milliseconds to catalog ranges", () => {
    expect(windowSecondsFrom(undefined)).toBe(DEFAULT_WINDOW_S);
    expect(windowSecondsFrom("30")).toBe(30);
    expect(windowSecondsFrom(9)).toBe(MIN_WINDOW_S);
    expect(windowSecondsFrom(601)).toBe(MAX_WINDOW_S);
    expect(meterMsFrom(undefined)).toBe(DEFAULT_METER_MS);
    expect(meterMsFrom("10")).toBe(10);
    expect(meterMsFrom(1)).toBe(MIN_METER_MS);
    expect(meterMsFrom(1001)).toBe(MAX_METER_MS);
  });

  it("sizes the buffer as N * (1000 / M) measurements", () => {
    expect(sampleCap()).toBe(3000);
    expect(sampleCap(30, 10)).toBe(3000);
    expect(sampleCap(10, 10)).toBe(1000);
    expect(sampleCap(600, 10)).toBe(60_000);
    expect(sampleCap(30, 1000)).toBe(30);
    expect(sampleCap(10, 1000)).toBe(10);
  });

  it("keeps a sliding window of the last cap samples", () => {
    const buf = new WindowBuf(4);
    expect(buf.snapshot()).toEqual([]);
    buf.push(1);
    buf.push(2);
    expect(buf.snapshot()).toEqual([1, 2]);
    buf.push(3);
    buf.push(4);
    buf.push(5);
    expect(buf.snapshot()).toEqual([2, 3, 4, 5]);
    buf.clear();
    expect(buf.snapshot()).toEqual([]);
  });

  it("uses the default time-based capacity on SampleBuf", () => {
    const buf = new SampleBuf();
    for (let i = 0; i < sampleCap() + 5; i += 1) {
      buf.push(i);
    }
    const snap = buf.snapshot();
    expect(snap).toHaveLength(sampleCap());
    expect(snap[0]).toBe(5);
    expect(snap[snap.length - 1]).toBe(sampleCap() + 4);
  });
});
