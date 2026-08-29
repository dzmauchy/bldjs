import { type BlockDef, type TypeExpr, displayType, isArrayType } from "$lib/blocks/ast";

/** WASM value type emitted for a language-agnostic XML type expression. */
export type WasmVal = string;

const WASM_PRIMITIVES = new Set(["i32", "i64", "f32", "f64"]);

function rawName(expr: TypeExpr): string {
  if (expr.kind !== "type") {
    return displayType(expr, true);
  }
  return expr.name.split(".").at(-1) ?? expr.name;
}

function typeToken(expr: TypeExpr): string {
  return displayType(expr, true).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function funcTypeId(expr: TypeExpr): string {
  return typeToken(expr);
}

/**
 * Map a language-agnostic XML type to a WASM valtype.
 *
 *   f64 / f32 / i32 / i64 → themselves
 *   bool                  → i32
 *   str                   → externref (js-string in wasm 3.0)
 *   c1<T>                 → (func (param T))
 *   c2<T1, T2>            → (func (param T1) (param T2))
 *   s<R>                  → (func (result R))
 *   f1<T, R>              → (func (param T) (result R))
 *   f2<T1, T2, R>         → (func (param T1) (param T2) (result R))
 *   T[]                   → array of T
 */
export function wasmValType(expr: TypeExpr): WasmVal {
  if (expr.kind !== "type") {
    return "externref";
  }
  const name = rawName(expr);
  if (WASM_PRIMITIVES.has(name) && expr.args.length === 0) {
    return name;
  }
  if (name === "bool" && expr.args.length === 0) {
    return "i32";
  }
  if (name === "str" && expr.args.length === 0) {
    return "externref";
  }
  if (name === "c1" && expr.args.length === 1) {
    return `(ref $c1_${typeToken(expr.args[0])})`;
  }
  if (name === "c2" && expr.args.length === 2) {
    return `(ref $c2_${typeToken(expr.args[0])}_${typeToken(expr.args[1])})`;
  }
  if (name === "s" && expr.args.length === 1) {
    return `(ref $s_${typeToken(expr.args[0])})`;
  }
  if (name === "f1" && expr.args.length === 2) {
    return `(ref $f1_${typeToken(expr.args[0])}_${typeToken(expr.args[1])})`;
  }
  if (name === "f2" && expr.args.length === 3) {
    return `(ref $f2_${typeToken(expr.args[0])}_${typeToken(expr.args[1])}_${typeToken(expr.args[2])})`;
  }
  if (isArrayType(expr) && expr.args.length === 1) {
    return `(ref $array_${typeToken(expr.args[0])})`;
  }
  return "externref";
}

export interface WasmSignature {
  id: string;
  name: string;
  params: { name: string; type: WasmVal }[];
  results: { name: string; type: WasmVal }[];
}

/** XML `<in>` ports are WASM params; `<out>` ports are WASM results. */
export function blockSignature(block: BlockDef): WasmSignature {
  return {
    id: block.id,
    name: block.name,
    params: block.inputs.map((port) => ({ name: port.name, type: wasmValType(port.ty) })),
    results: block.outputs.map((port) => ({ name: port.name, type: wasmValType(port.ty) })),
  };
}

/** Injected by the runtime; not an XML port. */
export const CTX_PARAM = { name: "ctx", type: "i32" } as const;

/** XML ports plus the optional runtime `$ctx` pointer. */
export function signatureWat(sig: WasmSignature, withCtx = true): string {
  const params = [...(withCtx ? [CTX_PARAM] : []), ...sig.params]
    .map((port) => `(param $${port.name} ${port.type})`)
    .join(" ");
  const results = sig.results.map((port) => `(result $${port.name} ${port.type})`).join(" ");
  return [`(func $${sig.id}`, params, results].filter((part) => part.length > 0).join(" ");
}
