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

  it("measures frequency in a 1s window using a sliding buffer with a single write pointer", () => {
    // 100 slots for 10ms delay = 1000ms window
    const intro = new ConnectorIntrospector(2, 10, false);
    expect(intro.windowSlots).toBe(100);

    // Initial steady samples don't count towards frequency when initialAsChange is false
    expect(intro.observe(0, 1.0)).toBe(true);
    expect(intro.observe(1, 0.0)).toBe(true);
    intro.advance();
    expect(intro.frequency(0)).toBe(0);
    expect(intro.frequency(1)).toBe(0);
    expect(intro.writePos).toBe(1);

    // Steady state: no changes
    for (let i = 0; i < 10; i++) {
      intro.observe(0, 1.0);
      intro.observe(1, 0.0);
      intro.advance();
    }
    expect(intro.frequencies()).toEqual([0, 0]);

    // Value changes on connector 1 (e.g. GPIO toggles from 0 to 1)
    expect(intro.observe(1, 1.0)).toBe(true);
    intro.advance();
    expect(intro.frequency(1)).toBe(1);

    // Value remains 1 for next 80 ticks: frequency stays 1 Hz in the 1s window
    for (let i = 0; i < 80; i++) {
      intro.observe(1, 1.0);
      intro.advance();
    }
    expect(intro.frequency(1)).toBe(1);

    // After 100 total ticks (1 second), the change slides out of the 1s window
    for (let i = 0; i < 25; i++) {
      intro.observe(1, 1.0);
      intro.advance();
    }
    expect(intro.frequency(1)).toBe(0);
  });

  it("advances the single write pointer by timestamps over 1s", () => {
    const intro = new ConnectorIntrospector(2, 10, false);
    const t0 = 1000;
    intro.advance(t0);

    // Seed baseline
    intro.observe(0, 0);
    intro.advance(t0);
    expect(intro.frequency(0)).toBe(0);

    // Change value
    intro.observe(0, 1);
    intro.advance(t0 + 50);
    expect(intro.frequency(0)).toBe(1);

    // Still within 1s window at t0 + 150
    intro.advance(t0 + 150);
    expect(intro.frequency(0)).toBe(1);

    // Past 1s window at t0 + 1150
    intro.advance(t0 + 1150);
    expect(intro.frequency(0)).toBe(0);
  });
});
