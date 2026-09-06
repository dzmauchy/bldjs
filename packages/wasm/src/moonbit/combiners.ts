import { countFrom, defFrom, DEFAULT_COUNT, DEFAULT_VALUE } from "@bld/xml/blocks/cs/ids";
import { MoonBlock } from "./block";
import type { MoonbitTarget } from "./compile";
import { CTX_PARAM, type MoonBlockEmit } from "./types";

function moonDouble(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function moonIdent(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function c1Tuple(length: number): string {
  return length === 1 ? "C1" : `(${Array.from({ length }, () => "C1").join(", ")})`;
}

/**
 * XML `(Double) -> Unit → Array[(Double) -> Unit]`.
 * Shared mutable slots start at `def`; each returned consumer updates one slot
 * then pushes the product of every slot into `input`.
 */
export function emitProductWrap(
  name: string,
  length?: number,
  def?: number,
  wiredMask?: number,
): string {
  const n = countFrom(length ?? DEFAULT_COUNT);
  const initial = defFrom(def ?? DEFAULT_VALUE);
  const ident = moonIdent(name);
  const targetMask = wiredMask ?? 0;
  const fields = Array.from({ length: n }, (_, index) => `  mut v${index} : Double`).join("\n");
  const inits = Array.from({ length: n }, (_, index) => `v${index}: ${moonDouble(initial)}`).join(", ");
  const productExpr = Array.from({ length: n }, (_, index) => `state_${ident}.v${index}`).join(" * ");
  const closures = Array.from({ length: n }, (_, index) => {
    const bit = 1 << index;
    const body =
      targetMask === 0
        ? `fn(v : Double) {
      state_${ident}.v${index} = v
      input(${productExpr})
    }`
        : `fn(v : Double) {
      state_${ident}.v${index} = v
      state_${ident}.init_mask = state_${ident}.init_mask | ${bit}
      if (state_${ident}.init_mask & ${targetMask}) == ${targetMask} {
        input(${productExpr})
      }
    }`;
    return n === 1 ? body : `    ${body.split("\n").join("\n    ")}`;
  });
  const result = n === 1 ? closures[0]! : `(\n${closures.join(",\n")}\n  )`;
  const maskField = targetMask === 0 ? "" : "  mut init_mask : Int\n";
  const maskInit = targetMask === 0 ? "" : "init_mask: 0, ";
  return `priv struct ProductState_${ident} {
${maskField}${fields}
}

let state_${ident} : ProductState_${ident} = { ${maskInit}${inits} }

fn ${name}(${CTX_PARAM}, input : C1) -> ${c1Tuple(n)} {
  ${result}
}
`;
}

export abstract class AbstractProductBlock extends MoonBlock {
  readonly defId = "product";
  abstract readonly target?: MoonbitTarget;

  emit(opts: MoonBlockEmit = {}): string {
    return emitProductWrap(opts.name ?? this.defId, opts.length, opts.def, opts.wiredMask);
  }
}

export class BrowserProductBlock extends AbstractProductBlock {
  readonly target = "wasm-gc" as const;
}

export class McuProductBlock extends AbstractProductBlock {
  readonly target = "wasm" as const;
}

// Aliases for compatibility
export {
  BrowserProductBlock as ProductMoonBlock,
  AbstractProductBlock as AbstractProduct,
  BrowserProductBlock as BrowserProduct,
  McuProductBlock as McuProduct,
};

export const PRODUCT_BLOCK = new BrowserProductBlock();

export function emitProduct(opts: MoonBlockEmit = {}): string {
  return PRODUCT_BLOCK.emit(opts);
}
