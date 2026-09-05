import { DEFAULT_OMEGA, DEFAULT_ZETA, omegaFrom, zetaFrom } from "./ids";
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
 * `1 - e^{-σt} (cos(ωd t) + (σ/ωd) sin(ωd t))`, `σ = ζω`, `ωd = ω√(1-ζ²)`.
 * Input is treated as time in seconds from the first sample.
 */
export class OvershootTransformer extends Transformer {
  readonly defId = "overshoot";
  readonly zeta: number;
  readonly omega: number;

  constructor(zeta: number = DEFAULT_ZETA, omega: number = DEFAULT_OMEGA, readonly timeInput: boolean = true) {
    super();
    this.zeta = zetaFrom(zeta);
    this.omega = omegaFrom(omega);
  }

  map(value: number): number {
    return overshootStep(value, this.zeta, this.omega);
  }

  override wrap(sink: DoubleConsumer): DoubleConsumer {
    if (this.timeInput) {
      let t0: number | undefined;
      return (value) => {
        t0 ??= value;
        sink(overshootStep(value - t0, this.zeta, this.omega));
      };
    }
    let initialized = false;
    let tStep = 0;
    let baseY = 0;
    let targetU = 0;
    let currentY = 0;
    return (value) => {
      const curT = performance.now() / 1000;
      if (!initialized) {
        initialized = true;
        tStep = curT;
        baseY = value;
        targetU = value;
        currentY = value;
        sink(value);
        return;
      }
      if (Math.abs(value - targetU) > 1e-6) {
        tStep = curT;
        baseY = currentY;
        targetU = value;
      }
      const tau = Math.max(0, curT - tStep);
      const factor = overshootStep(tau, this.zeta, this.omega);
      currentY = baseY + (targetU - baseY) * factor;
      sink(currentY);
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
export function overshoot(
  sink: DoubleConsumer,
  zeta: number = DEFAULT_ZETA,
  omega: number = DEFAULT_OMEGA,
  timeInput: boolean = true,
): DoubleConsumer {
  return new OvershootTransformer(zeta, omega, timeInput).wrap(sink);
}

export const sinFunc = sin;
/** @deprecated Use {@link sin}. */
export const sinConsumer = sin;
export const cosFunc = cos;
export const overshootFunc = overshoot;

export function overshootStep(time: number, zeta: number = DEFAULT_ZETA, omega: number = DEFAULT_OMEGA): number {
  if (!(time > 0)) {
    return 0;
  }
  const z = zetaFrom(zeta);
  const w = omegaFrom(omega);
  const wd = w * Math.sqrt(1 - z * z);
  const sigma = z * w;
  return 1 - Math.exp(-sigma * time) * (Math.cos(wd * time) + (sigma / wd) * Math.sin(wd * time));
}

export function mapOnce(defId: string, value: number, zeta?: number, omega?: number): number {
  if (defId === "overshoot") {
    return overshootStep(value, zeta, omega);
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
