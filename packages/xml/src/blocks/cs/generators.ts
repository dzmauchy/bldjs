import { DEFAULT_PERIOD_MS, periodMsFrom } from "./ids";
import type { DoubleConsumer } from "./types";

/**
 * Pure push. MoonBit ports:
 *
 *   timer(c) / random(c)  : (Double) -> Unit → Unit
 *   sin(c) / cos(c)       : (Double) -> Unit → (Double) -> Unit
 *   scope()               : Array[(Double) -> Unit]   (vector of plot sinks)
 *
 * Composition: timer(sin(plot[0]))
 *
 * Quantized generators (`timer`, `random`) use an internal period (ms) from the
 * catalog `period` range input (default 10). GPIO In samples the pin once on
 * start, then again on each edge, and has no period. MoonBit blocks repeat the
 * XML signature plus unused runtime `_ctx : Int`.
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

  abstract sample(time: number): number;

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
  sample(time: number): number {
    return time;
  }
}

export class RandomGenerator extends Generator {
  sample(_time: number): number {
    return Math.random();
  }
}

export class GpioInGenerator extends Generator {
  sample(_time: number): number {
    return 0;
  }

  override run(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
    if (running()) {
      c(this.sample(now()));
    }
  }
}

const GENERATORS: Record<string, new (periodMs?: number) => Generator> = {
  timer: TimerGenerator,
  random: RandomGenerator,
  gpio_in: GpioInGenerator,
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

/** Plot sink — returns a vector of `(Double) -> Unit` channels. */
export function scope(...plots: DoubleConsumer[]): DoubleConsumer[] {
  return plots;
}

/** Hidden runtime fan-out: one `(Double) -> Unit` that forwards each sample to every downstream. */
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
  return generatorFor(defId)?.sample(time) ?? time;
}
