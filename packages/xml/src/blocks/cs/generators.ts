import { DEFAULT_PERIOD_MS, periodMsFrom } from "./ids";
import type { DoubleConsumer } from "./types";

/**
 * Pure push. Compact display writes c1 as c:
 *
 *   timer(c) / random(c)  : c<f64> → void
 *   sin(c) / cos(c)       : c<f64> → c<f64>
 *   scope()               : c<f64>[]            (vector of plot sinks)
 *
 * Composition: timer(sin(plot[0]))
 *
 * Each generator uses an internal quantizer whose period (ms) comes from the
 * catalog `period` range input (default 10). Binaryen blocks repeat the XML
 * signature plus runtime `$ctx i32`.
 */

function parkNanos(periodNs: number): void {
  if (periodNs <= 0) {
    return;
  }
}

/**
 * Shared generator: sample from time, push into a consumer, then apply the
 * internal quantizer (period is honored by the worker `setInterval`).
 */
export abstract class Generator {
  constructor(readonly periodMs = DEFAULT_PERIOD_MS) {}

  protected abstract sample(time: number): number;

  /** Internal quantizer: forward the sample, then park for `periodMs`. */
  protected quantized(c: DoubleConsumer): DoubleConsumer {
    const periodNs = periodMsFrom(this.periodMs) * 1_000_000;
    return (value) => {
      c(value);
      parkNanos(periodNs);
    };
  }

  run(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
    const sink = this.quantized(c);
    while (running()) {
      sink(this.sample(now()));
    }
  }
}

export class TimerGenerator extends Generator {
  protected sample(time: number): number {
    return time;
  }
}

export class RandomGenerator extends Generator {
  protected sample(_time: number): number {
    return Math.random();
  }
}

const GENERATORS: Record<string, new (periodMs?: number) => Generator> = {
  timer: TimerGenerator,
  random: RandomGenerator,
};

export function generatorFor(defId: string, periodMs = DEFAULT_PERIOD_MS): Generator | undefined {
  const Ctor = GENERATORS[defId];
  return Ctor ? new Ctor(periodMs) : undefined;
}

/** Accepts a sink and pushes timestamps while `running`. */
export function timer(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
  new TimerGenerator().run(c, running, now);
}

/** Accepts a sink and pushes random samples in `[0, 1)` while `running`. */
export function random(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
  new RandomGenerator().run(c, running, now);
}

/** Plot sink — returns a vector of `c<f64>` channels. */
export function scope(...plots: DoubleConsumer[]): DoubleConsumer[] {
  return plots;
}

/** Hidden runtime fan-out: one `c<f64>` that forwards each sample to every downstream. */
export function fork(...downstreams: DoubleConsumer[]): DoubleConsumer {
  if (downstreams.length === 1) {
    return downstreams[0];
  }
  return (v) => {
    for (const downstream of downstreams) {
      downstream(v);
    }
  };
}

export function nowSecs(): number {
  return Date.now() / 1000;
}

export function sampleOnce(defId: string, time: number): number {
  switch (defId) {
    case "random":
      return Math.random();
    default:
      return time;
  }
}
