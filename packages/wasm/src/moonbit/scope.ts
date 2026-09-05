import { MoonBlock } from "./block";
import { CTX_PARAM, type MoonBlockEmit } from "./types";

function c1Tuple(length: number): string {
  return length === 1 ? "C1" : `(${Array.from({ length }, () => "C1").join(", ")})`;
}

function plotClosure(ring: number): string {
  return `fn(v : Double) { host_push(v, ${ring}) }`;
}

/**
 * scope — XML `() → Array[(Double) -> Unit]`. Extra `_ctx`.
 * Returns plot sinks; `length` is the number of outgoing connectors.
 */
export class ScopeMoonBlock extends MoonBlock {
  readonly defId = "scope";

  emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    const length = Math.max(opts.length ?? 1, 1);
    const rings = opts.rings ?? Array.from({ length }, (_, index) => index);
    const plots = Array.from({ length }, (_, index) => plotClosure(rings[index] ?? index));
    const result = length === 1 ? plots[0]! : `(${plots.join(", ")})`;
    return `fn ${name}(${CTX_PARAM}) -> ${c1Tuple(length)} {
  ${result}
}
`;
  }
}

export const SCOPE_BLOCK = new ScopeMoonBlock();

export function emitScope(opts: MoonBlockEmit = {}): string {
  return SCOPE_BLOCK.emit(opts);
}
