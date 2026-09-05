import { describe, expect, it } from "vitest";
import {
  DEFAULT_METER_MS,
  DEFAULT_SAMPLE_COUNT,
  MAX_METER_MS,
  MAX_SAMPLE_COUNT,
  MIN_METER_MS,
  MIN_SAMPLE_COUNT,
  meterMsFrom,
  sampleCap,
  sampleCountFrom,
} from "./ids";
import { SampleBuf, WindowBuf } from "./samples";

describe("scope window", () => {
  it("clamps sample count N and sampling period M to catalog ranges", () => {
    expect(sampleCountFrom(undefined)).toBe(DEFAULT_SAMPLE_COUNT);
    expect(sampleCountFrom("30")).toBe(30);
    expect(sampleCountFrom(9)).toBe(MIN_SAMPLE_COUNT);
    expect(sampleCountFrom(601)).toBe(MAX_SAMPLE_COUNT);
    expect(meterMsFrom(undefined)).toBe(DEFAULT_METER_MS);
    expect(meterMsFrom("10")).toBe(10);
    expect(meterMsFrom(1)).toBe(MIN_METER_MS);
    expect(meterMsFrom(1001)).toBe(MAX_METER_MS);
  });

  it("sizes the Float64Array as N samples", () => {
    expect(sampleCap()).toBe(DEFAULT_SAMPLE_COUNT);
    expect(sampleCap(30)).toBe(30);
    expect(sampleCap(10)).toBe(10);
    expect(sampleCap(600)).toBe(600);
  });

  it("keeps a sliding window of the last cap samples, including NaN", () => {
    const buf = new WindowBuf(4);
    expect(buf.values).toBeInstanceOf(Float64Array);
    expect(buf.snapshot()).toEqual([]);
    expect(buf.values.every((value) => Number.isNaN(value))).toBe(true);
    buf.push(1);
    buf.push(Number.NaN);
    expect(buf.snapshot()[0]).toBe(1);
    expect(Number.isNaN(buf.snapshot()[1])).toBe(true);
    buf.push(3);
    buf.push(4);
    buf.push(5);
    expect(buf.snapshot()[0]).toBeNaN();
    expect(buf.snapshot().slice(1)).toEqual([3, 4, 5]);
    buf.clear();
    expect(buf.snapshot()).toEqual([]);
    expect(buf.values.every((value) => Number.isNaN(value))).toBe(true);
  });

  it("uses the default sample count on SampleBuf", () => {
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
