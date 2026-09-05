import { MoonBlock } from "./block";
import { CTX_PARAM, type MoonBlockEmit } from "./types";

/**
 * XML `c<f64> → c<f64>` wrapper: capture `input` and return a `C1` that maps then forwards.
 * Extra runtime param `_ctx` is not an XML port.
 */
export function emitConsumerWrap(name: string, mapExpr: (value: string) => string): string {
  return `fn ${name}(${CTX_PARAM}, input : C1) -> C1 {
  fn(v : Double) { input(${mapExpr("v")}) }
}
`;
}

export abstract class MoonTransformer extends MoonBlock {
  protected abstract mapExpr(value: string): string;

  emit(opts: MoonBlockEmit = {}): string {
    return emitConsumerWrap(opts.name ?? this.defId, (value) => this.mapExpr(value));
  }
}

export class SinMoonBlock extends MoonTransformer {
  readonly defId = "sin";

  protected mapExpr(value: string): string {
    return `math_sin(${value})`;
  }
}

export class CosMoonBlock extends MoonTransformer {
  readonly defId = "cos";

  protected mapExpr(value: string): string {
    return `math_cos(${value})`;
  }
}

export const SIN_BLOCK = new SinMoonBlock();
export const COS_BLOCK = new CosMoonBlock();

export function emitSin(opts: MoonBlockEmit = {}): string {
  return SIN_BLOCK.emit(opts);
}

export function emitCos(opts: MoonBlockEmit = {}): string {
  return COS_BLOCK.emit(opts);
}
