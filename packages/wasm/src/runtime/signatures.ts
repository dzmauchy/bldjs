import { type BlockDef, type PortDef, type TypeExpr, consumerType, displayType, funcType, isArrayType } from "@bld/model/blocks/ast";

/** WASM value type emitted for a MoonBit XML type expression. */
export type WasmVal = string;

const WASM_PRIMITIVES: Record<string, string> = {
  bool: "i32",
  u64: "i64",
  u32: "i32",
  i64: "i64",
  i32: "i32",
  f32: "f32",
  f64: "f64",
  char: "i32",
  void: "void",
  Int: "i32",
  UInt: "i32",
  Bool: "i32",
  Byte: "i32",
  Char: "i32",
  Int64: "i64",
  UInt64: "i64",
  Float: "f32",
  Double: "f64",
  Unit: "void",
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

function expandAlias(expr: TypeExpr): TypeExpr {
  if (expr.kind === "type") {
    const name = expr.name.split(".").at(-1) ?? expr.name;
    if (name === "c0" && expr.args.length === 0) {
      return consumerType();
    }
    if (name === "c1" && expr.args.length === 1) {
      return consumerType(expr.args[0]);
    }
    if (name === "c2" && expr.args.length === 2) {
      return consumerType(expr.args[0], expr.args[1]);
    }
    if (name === "f0" && expr.args.length === 1) {
      return funcType([], expr.args[0]);
    }
    if (name === "f1" && expr.args.length === 2) {
      return funcType([expr.args[0]], expr.args[1]);
    }
    if (name === "f2" && expr.args.length === 3) {
      return funcType([expr.args[0], expr.args[1]], expr.args[2]);
    }
  }
  return expr;
}

/**
 * Heap type name for a MoonBit XML type (`fn_Double_Unit`, `array_fn_Double_Unit`).
 */
export function wasmHeapTypeName(expr: TypeExpr): string {
  const expanded = expandAlias(expr);
  if (expanded.kind === "func") {
    const params = expanded.params.map(typeToken).filter((token) => token.length > 0);
    const ret = typeToken(expanded.ret);
    return ["fn", ...params, ret].filter((token) => token.length > 0).join("_");
  }
  if (expanded.kind === "tuple") {
    return `tuple_${expanded.elems.map(wasmHeapTypeName).join("_")}`;
  }
  if (expanded.kind === "type" && isArrayType(expanded) && expanded.args.length === 1) {
    return `array_${wasmHeapTypeName(expanded.args[0])}`;
  }
  return typeToken(expanded);
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
  const expanded = expandAlias(expr);
  if (expanded.kind === "func" || expanded.kind === "tuple") {
    return `(ref $${wasmHeapTypeName(expanded)})`;
  }
  if (expanded.kind !== "type") {
    return "externref";
  }
  const name = rawName(expanded);
  if (expanded.args.length === 0 && name in WASM_PRIMITIVES) {
    return WASM_PRIMITIVES[name]!;
  }
  if (name === "String" && expanded.args.length === 0) {
    return "externref";
  }
  if (isArrayType(expanded) && expanded.args.length === 1) {
    return `(ref $${wasmHeapTypeName(expanded)})`;
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
