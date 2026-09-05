import { DEFAULT_ZETA, zetaFrom } from "./ids";
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
 * Classic underdamped second-order unit-step response with ωn = 1:
 * `1 - e^{-ζt} (cos(ωd t) + (ζ/ωd) sin(ωd t))`, `ωd = √(1-ζ²)`.
 * Input is treated as time in seconds from the first sample.
 */
export class OvershootTransformer extends Transformer {
  readonly defId = "overshoot";
  readonly zeta: number;

  constructor(zeta: number = DEFAULT_ZETA) {
    super();
    this.zeta = zetaFrom(zeta);
  }

  map(value: number): number {
    return overshootStep(value, this.zeta);
  }

  override wrap(sink: DoubleConsumer): DoubleConsumer {
    let t0: number | undefined;
    return (value) => {
      t0 ??= value;
      sink(overshootStep(value - t0, this.zeta));
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
export function overshoot(sink: DoubleConsumer, zeta: number = DEFAULT_ZETA): DoubleConsumer {
  return new OvershootTransformer(zeta).wrap(sink);
}

export const sinFunc = sin;
/** @deprecated Use {@link sin}. */
export const sinConsumer = sin;
export const cosFunc = cos;
export const overshootFunc = overshoot;

export function overshootStep(time: number, zeta: number = DEFAULT_ZETA): number {
  if (!(time > 0)) {
    return 0;
  }
  const z = zetaFrom(zeta);
  const wd = Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * time) * (Math.cos(wd * time) + (z / wd) * Math.sin(wd * time));
}

export function mapOnce(defId: string, value: number, zeta?: number): number {
  if (defId === "overshoot") {
    return overshootStep(value, zeta);
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
