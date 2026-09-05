import type { MoonBlockEmit } from "./types";

/**
 * XML `c<f64> → c<f64>` wrapper: capture `input` and return a `C1` that maps then forwards.
 * Extra runtime param `ctx : Int` is not an XML port.
 */
export function emitConsumerWrap(name: string, mapExpr: (value: string) => string): string {
  return `fn ${name}(ctx : Int, input : C1) -> C1 {
  let _ = ctx
  fn(v : Double) { input(${mapExpr("v")}) }
}
`;
}

export function emitSin(opts: MoonBlockEmit = {}): string {
  return emitConsumerWrap(opts.name ?? "sin", (value) => `math_sin(${value})`);
}

export function emitCos(opts: MoonBlockEmit = {}): string {
  return emitConsumerWrap(opts.name ?? "cos", (value) => `math_cos(${value})`);
}
