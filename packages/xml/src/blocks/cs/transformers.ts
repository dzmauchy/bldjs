import type { DoubleConsumer, F64Func } from "./types";

/** XML `c<f64> → c<f64>`: map a sample, then forward it to a captured sink. */
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

const TRANSFORMERS: Record<string, Transformer> = {
  sin: new SinTransformer(),
  cos: new CosTransformer(),
};

export function transformerOf(defId: string): Transformer | undefined {
  return TRANSFORMERS[defId];
}

/** XML `c<f64> → c<f64>`: capture a sink and return a consumer that maps then forwards. */
export function sin(sink: DoubleConsumer): DoubleConsumer {
  return TRANSFORMERS.sin.wrap(sink);
}

/** XML `c<f64> → c<f64>`: capture a sink and return a consumer that maps then forwards. */
export function cos(sink: DoubleConsumer): DoubleConsumer {
  return TRANSFORMERS.cos.wrap(sink);
}

export const sinFunc = sin;
/** @deprecated Use {@link sin}. */
export const sinConsumer = sin;
export const cosFunc = cos;

export function mapOnce(defId: string, value: number): number {
  return TRANSFORMERS[defId]?.map(value) ?? value;
}

export function transformerFor(defId: string): ((sink: F64Func) => F64Func) | undefined {
  const transformer = TRANSFORMERS[defId];
  return transformer ? (sink) => transformer.wrap(sink) : undefined;
}
