import { MoonBlock } from "./block";
import type { MoonbitTarget } from "./compile";
import { CTX_PARAM, type MoonBlockEmit } from "./types";

function c1Tuple(length: number): string {
  return length === 1 ? "C1" : `(${Array.from({ length }, () => "C1").join(", ")})`;
}

function plotClosure(ring: number): string {
  return `fn(v : Double) { host_push(v, ${ring}) }`;
}

/**
 * Abstract scope block. Returns plot sinks; `length` is number of outgoing connectors.
 */
export abstract class AbstractScopeBlock extends MoonBlock {
  readonly defId = "scope";
  abstract readonly target?: MoonbitTarget;

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

export class BrowserScopeBlock extends AbstractScopeBlock {
  readonly target = "wasm-gc" as const;
}

export class McuScopeBlock extends AbstractScopeBlock {
  readonly target = "wasm" as const;
}

// Aliases for compatibility
export {
  BrowserScopeBlock as ScopeMoonBlock,
  AbstractScopeBlock as AbstractScope,
  BrowserScopeBlock as BrowserScope,
  McuScopeBlock as McuScope,
};

export const SCOPE_BLOCK = new BrowserScopeBlock();

export function emitScope(opts: MoonBlockEmit = {}): string {
  return SCOPE_BLOCK.emit(opts);
}
