import { DEFAULT_WD, DEFAULT_ZETA, wdFrom, zetaFrom } from "./ids";
import type { DoubleConsumer, F64Func } from "./types";

/** XML `(Double) -> Unit → (Double) -> Unit`: map a sample, then forward it to a captured sink. */
export abstract class Transformer {
  abstract readonly defId: string;

  abstract map(value: number): number;

  wrap(sink: DoubleConsumer): DoubleConsumer {
    return (value) => sink(this.map(value));
  }
}

export class SinTransformer extends Transformer {
  readonly defId = "sin";

  map(value: number): number {
    return Math.sin(value);
  }
}

export class CosTransformer extends Transformer {
  readonly defId = "cos";

  map(value: number): number {
    return Math.cos(value);
  }
}

/**
 * Classic underdamped second-order unit-step response:
 * `1 - e^{-σt} (cos(ωd t) + (σ/ωd) sin(ωd t))`, `σ = ζωd / √(1-ζ²)`.
 * Input is treated as time in seconds from the first sample.
 */
export class OvershootTransformer extends Transformer {
  readonly defId = "overshoot";
  readonly zeta: number;
  readonly wd: number;

  constructor(zeta: number = DEFAULT_ZETA, wd: number = DEFAULT_WD) {
    super();
    this.zeta = zetaFrom(zeta);
    this.wd = wdFrom(wd);
  }

  map(value: number): number {
    return overshootStep(value, this.zeta, this.wd);
  }

  override wrap(sink: DoubleConsumer): DoubleConsumer {
    let t0: number | undefined;
    return (value) => {
      t0 ??= value;
      sink(overshootStep(value - t0, this.zeta, this.wd));
    };
  }
}

const TRANSFORMERS: Record<string, Transformer> = {
  sin: new SinTransformer(),
  cos: new CosTransformer(),
  overshoot: new OvershootTransformer(),
};

export function transformerOf(defId: string): Transformer | undefined {
  return TRANSFORMERS[defId];
}

/** XML `(Double) -> Unit → (Double) -> Unit`: capture a sink and return a consumer that maps then forwards. */
export function sin(sink: DoubleConsumer): DoubleConsumer {
  return TRANSFORMERS.sin.wrap(sink);
}

/** XML `(Double) -> Unit → (Double) -> Unit`: capture a sink and return a consumer that maps then forwards. */
export function cos(sink: DoubleConsumer): DoubleConsumer {
  return TRANSFORMERS.cos.wrap(sink);
}

/** XML `(Double) -> Unit → (Double) -> Unit`: capture a sink and return a second-order step response. */
export function overshoot(sink: DoubleConsumer, zeta: number = DEFAULT_ZETA, wd: number = DEFAULT_WD): DoubleConsumer {
  return new OvershootTransformer(zeta, wd).wrap(sink);
}

export const sinFunc = sin;
/** @deprecated Use {@link sin}. */
export const sinConsumer = sin;
export const cosFunc = cos;
export const overshootFunc = overshoot;

export function overshootStep(time: number, zeta: number = DEFAULT_ZETA, wd: number = DEFAULT_WD): number {
  if (!(time > 0)) {
    return 0;
  }
  const z = zetaFrom(zeta);
  const omega = wdFrom(wd);
  const sigma = (z * omega) / Math.sqrt(1 - z * z);
  return 1 - Math.exp(-sigma * time) * (Math.cos(omega * time) + (sigma / omega) * Math.sin(omega * time));
}

export function mapOnce(defId: string, value: number, zeta?: number, wd?: number): number {
  if (defId === "overshoot") {
    return overshootStep(value, zeta, wd);
  }
  return TRANSFORMERS[defId]?.map(value) ?? value;
}

export function transformerFor(defId: string): ((sink: F64Func) => F64Func) | undefined {
  if (defId === "overshoot") {
    return (sink) => new OvershootTransformer().wrap(sink);
  }
  const transformer = TRANSFORMERS[defId];
  return transformer ? (sink) => transformer.wrap(sink) : undefined;
}
