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
  it("clamps window seconds N and quantizer period M to catalog ranges", () => {
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

  it("fills a Float64Array with NaN and slides with one write index", () => {
    const buf = new WindowBuf(4);
    expect(buf.values).toBeInstanceOf(Float64Array);
    expect(buf.values.length).toBe(4);
    expect([...buf.values].every((value) => Number.isNaN(value))).toBe(true);
    expect(buf.index).toBe(0);
    expect(buf.snapshot()).toEqual([]);

    buf.push(1);
    expect(buf.index).toBe(1);
    expect(buf.values[0]).toBe(1);
    buf.push(Number.NaN);
    expect(Number.isNaN(buf.snapshot()[1])).toBe(true);
    buf.push(3);
    buf.push(4);
    expect(buf.index).toBe(0);
    expect(buf.snapshot().slice(0, 1)).toEqual([1]);
    expect(buf.snapshot().slice(2)).toEqual([3, 4]);

    const before = Float64Array.from(buf.values);
    buf.push(5);
    expect(buf.index).toBe(1);
    expect(buf.values[0]).toBe(5);
    expect(buf.values[1]).toBe(before[1]);
    expect(buf.values[2]).toBe(before[2]);
    expect(buf.values[3]).toBe(before[3]);
    expect(buf.snapshot()[0]).toBeNaN();
    expect(buf.snapshot().slice(1)).toEqual([3, 4, 5]);

    buf.clear();
    expect(buf.index).toBe(0);
    expect(buf.snapshot()).toEqual([]);
    expect([...buf.values].every((value) => Number.isNaN(value))).toBe(true);
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
