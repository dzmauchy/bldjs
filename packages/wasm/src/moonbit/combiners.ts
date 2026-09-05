import { countFrom, defFrom, DEFAULT_COUNT, DEFAULT_VALUE } from "@bld/xml/blocks/cs/ids";
import { MoonBlock } from "./block";
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
export function emitProductWrap(name: string, length?: number, def?: number): string {
  const n = countFrom(length ?? DEFAULT_COUNT);
  const initial = defFrom(def ?? DEFAULT_VALUE);
  const ident = moonIdent(name);
  const fields = Array.from({ length: n }, (_, index) => `  mut v${index} : Double`).join("\n");
  const inits = Array.from({ length: n }, (_, index) => `v${index}: ${moonDouble(initial)}`).join(", ");
  const productExpr = Array.from({ length: n }, (_, index) => `state_${ident}.v${index}`).join(" * ");
  const closures = Array.from({ length: n }, (_, index) => {
    const body = `fn(v : Double) {
      state_${ident}.v${index} = v
      input(${productExpr})
    }`;
    return n === 1 ? body : `    ${body.split("\n").join("\n    ")}`;
  });
  const result = n === 1 ? closures[0]! : `(\n${closures.join(",\n")}\n  )`;
  return `priv struct ProductState_${ident} {
${fields}
}

let state_${ident} : ProductState_${ident} = { ${inits} }

fn ${name}(${CTX_PARAM}, input : C1) -> ${c1Tuple(n)} {
  ${result}
}
`;
}

export class ProductMoonBlock extends MoonBlock {
  readonly defId = "product";

  emit(opts: MoonBlockEmit = {}): string {
    return emitProductWrap(opts.name ?? this.defId, opts.length, opts.def);
  }
}

export const PRODUCT_BLOCK = new ProductMoonBlock();

export function emitProduct(opts: MoonBlockEmit = {}): string {
  return PRODUCT_BLOCK.emit(opts);
}
