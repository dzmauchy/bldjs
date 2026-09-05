import { type BlockDef, type PortDef, type TypeExpr, displayType, isArrayType } from "@bld/xml/blocks/ast";

/** WASM value type emitted for a MoonBit XML type expression. */
export type WasmVal = string;

const WASM_PRIMITIVES: Record<string, string> = {
  Int: "i32",
  UInt: "i32",
  Bool: "i32",
  Byte: "i32",
  Char: "i32",
  Int64: "i64",
  UInt64: "i64",
  Float: "f32",
  Double: "f64",
};

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
 * Heap type name for a MoonBit XML type (`fn_Double_Unit`, `array_fn_Double_Unit`).
 */
export function wasmHeapTypeName(expr: TypeExpr): string {
  if (expr.kind === "func") {
    const params = expr.params.map(typeToken).filter((token) => token.length > 0);
    const ret = typeToken(expr.ret);
    return ["fn", ...params, ret].filter((token) => token.length > 0).join("_");
  }
  if (expr.kind === "tuple") {
    return `tuple_${expr.elems.map(wasmHeapTypeName).join("_")}`;
  }
  if (expr.kind === "type" && isArrayType(expr) && expr.args.length === 1) {
    return `array_${wasmHeapTypeName(expr.args[0])}`;
  }
  return typeToken(expr);
}

/**
 * Map a MoonBit XML type to a WASM valtype.
 *
 *   Double / Float / Int / Int64 → f64 / f32 / i32 / i64
 *   Bool                         → i32
 *   String                       → externref (js-string builtins)
 *   (T) -> R                     → (ref $fn_T_R)
 *   Array[T]                     → (ref $array_T)
 */
export function wasmValType(expr: TypeExpr): WasmVal {
  if (expr.kind === "func" || expr.kind === "tuple") {
    return `(ref $${wasmHeapTypeName(expr)})`;
  }
  if (expr.kind !== "type") {
    return "externref";
  }
  const name = rawName(expr);
  if (expr.args.length === 0 && name in WASM_PRIMITIVES) {
    return WASM_PRIMITIVES[name]!;
  }
  if (name === "String" && expr.args.length === 0) {
    return "externref";
  }
  if (isArrayType(expr) && expr.args.length === 1) {
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
