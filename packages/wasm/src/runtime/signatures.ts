import { type BlockDef, type PortDef, type TypeExpr, displayType, isArrayType } from "@bld/xml";

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
 * Heap type name for an XML type (`c1_f64`, `array_c1_f64`).
 * Array types keep the element constructor so `c<f64>[]` does not collapse to `c_f64`.
 */
export function wasmHeapTypeName(expr: TypeExpr): string {
  if (expr.kind !== "type") {
    return typeToken(expr);
  }
  const name = rawName(expr);
  if (name === "c1" && expr.args.length === 1) {
    return `c1_${typeToken(expr.args[0])}`;
  }
  if (name === "c2" && expr.args.length === 2) {
    return `c2_${typeToken(expr.args[0])}_${typeToken(expr.args[1])}`;
  }
  if (name === "s" && expr.args.length === 1) {
    return `s_${typeToken(expr.args[0])}`;
  }
  if (name === "f1" && expr.args.length === 2) {
    return `f1_${typeToken(expr.args[0])}_${typeToken(expr.args[1])}`;
  }
  if (name === "f2" && expr.args.length === 3) {
    return `f2_${typeToken(expr.args[0])}_${typeToken(expr.args[1])}_${typeToken(expr.args[2])}`;
  }
  if (isArrayType(expr) && expr.args.length === 1) {
    return `array_${wasmHeapTypeName(expr.args[0])}`;
  }
  return typeToken(expr);
}

/**
 * Map a language-agnostic XML type to a WASM valtype.
 *
 *   f64 / f32 / i32 / i64 → themselves
 *   bool                  → i32
 *   str                   → externref (js-string builtins)
 *   c1<T>                 → (ref $c1_T)
 *   c2<T1, T2>            → (ref $c2_T1_T2)
 *   s<R>                  → (ref $s_R)
 *   f1<T, R>              → (ref $f1_T_R)
 *   f2<T1, T2, R>         → (ref $f2_T1_T2_R)
 *   T[]                   → (ref $array_T)  (dynamically sized)
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
  if (
    (name === "c1" && expr.args.length === 1) ||
    (name === "c2" && expr.args.length === 2) ||
    (name === "s" && expr.args.length === 1) ||
    (name === "f1" && expr.args.length === 2) ||
    (name === "f2" && expr.args.length === 3) ||
    (isArrayType(expr) && expr.args.length === 1)
  ) {
    return `(ref $${wasmHeapTypeName(expr)})`;
  }
  return "externref";
}

export interface WasmSignature {
  id: string;
  name: string;
  params: { name: string; type: WasmVal }[];
  results: { name: string; type: WasmVal }[];
}

function portWasmVal(port: PortDef): WasmVal {
  return wasmValType(port.ty);
}

/** XML `<in>` ports are WASM params; `<out>` ports are WASM results. */
export function blockSignature(block: BlockDef): WasmSignature {
  return {
    id: block.id,
    name: block.name,
    params: block.inputs.map((port) => ({ name: port.name, type: portWasmVal(port) })),
    results: block.outputs.map((port) => ({ name: port.name, type: portWasmVal(port) })),
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

export function typeDecl(id: string, params: { name: string; type: string }[], results: { name: string; type: string }[]): string {
  const inner = [
    ...params.map((port) => `(param $${port.name} ${port.type})`),
    ...results.map((port) => `(result $${port.name} ${port.type})`),
  ].join(" ");
  return `  (type $${id} (func${inner ? ` ${inner}` : ""}))`;
}

export function blockTypeWat(sig: WasmSignature): string {
  return typeDecl(`fn_${sig.id}`, [CTX_PARAM, ...sig.params], sig.results);
}
