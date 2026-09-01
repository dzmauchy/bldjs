import type { DoubleConsumer, F64Func } from "./types";

/** XML `c<f64> → c<f64>`: capture a sink and return a consumer that maps then forwards. */
export function sin(sink: DoubleConsumer): DoubleConsumer {
  return (value) => sink(Math.sin(value));
}

/** XML `c<f64> → c<f64>`: capture a sink and return a consumer that maps then forwards. */
export function cos(sink: DoubleConsumer): DoubleConsumer {
  return (value) => sink(Math.cos(value));
}

export const sinFunc = sin;
/** @deprecated Use {@link sin}. */
export const sinConsumer = sin;
export const cosFunc = cos;

export function mapOnce(defId: string, value: number): number {
  switch (defId) {
    case "sin":
      return Math.sin(value);
    case "cos":
      return Math.cos(value);
    default:
      return value;
  }
}

export function transformerFor(defId: string): ((sink: F64Func) => F64Func) | undefined {
  switch (defId) {
    case "sin":
      return sin;
    case "cos":
      return cos;
    default:
      return undefined;
  }
}
