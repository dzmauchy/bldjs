import { type BlockDef, type TypeExpr, displayType } from "$lib/blocks/ast";

/** WASM value type emitted for an XML type expression. */
export type WasmVal = string;

const PRIMITIVES = new Set(["i32", "i64", "f32", "f64", "v128"]);

function rawName(expr: TypeExpr): string {
  if (expr.kind !== "type") {
    return displayType(expr, true);
  }
  return expr.name.split(".").at(-1) ?? expr.name;
}

export function funcTypeId(expr: TypeExpr): string {
  return `fn_${displayType(expr, true).replace(/[^A-Za-z0-9]+/g, "_")}`;
}

/**
 * Map an XML type to a WASM valtype.
 * `func<T>` is a typed function reference `(ref $fn_…)`.
 */
export function wasmValType(expr: TypeExpr): WasmVal {
  if (expr.kind !== "type") {
    return "externref";
  }
  const name = rawName(expr);
  if (PRIMITIVES.has(name) && expr.args.length === 0) {
    return name;
  }
  if (name === "funcref" && expr.args.length === 0) {
    return "funcref";
  }
  if (name === "externref" && expr.args.length === 0) {
    return "externref";
  }
  if (name === "memory" && expr.args.length === 0) {
    return "(ref $memory)";
  }
  if (name === "func" && expr.args.length === 1) {
    return `(ref $${funcTypeId(expr.args[0])})`;
  }
  if (name === "table" && expr.args.length === 1) {
    return `(ref $table_${rawName(expr.args[0])})`;
  }
  if (name === "global" && expr.args.length === 1) {
    return `(ref $global_${rawName(expr.args[0])})`;
  }
  if (name === "map" && expr.args.length === 2) {
    return `(ref $map_${rawName(expr.args[0])}_${rawName(expr.args[1])})`;
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
