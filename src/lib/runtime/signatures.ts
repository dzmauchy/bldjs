import { type BlockDef, type PortDef, type TypeExpr, displayType, isArrayType } from "$lib/blocks/ast";

/** AssemblyScript type emitted for a language-agnostic XML type expression. */
export type AsVal = string;

const AS_PRIMITIVES = new Set(["i32", "i64", "f32", "f64", "bool"]);

const AS_KEYWORDS = new Set([
  "in",
  "for",
  "if",
  "else",
  "type",
  "void",
  "null",
  "true",
  "false",
  "this",
  "new",
  "return",
  "class",
  "function",
  "const",
  "let",
  "var",
  "import",
  "export",
]);

function rawName(expr: TypeExpr): string {
  if (expr.kind !== "type") {
    return displayType(expr, true);
  }
  return expr.name.split(".").at(-1) ?? expr.name;
}

/**
 * AssemblyScript identifier for an XML port name.
 * Compact `in` is reserved, so it becomes `inn`.
 */
export function asIdent(name: string): string {
  if (name === "in") {
    return "inn";
  }
  if (AS_KEYWORDS.has(name)) {
    return `${name}_`;
  }
  return name;
}

/**
 * Map a language-agnostic XML type to an AssemblyScript type.
 *
 *   f64 / f32 / i32 / i64 / bool → themselves
 *   str                          → string
 *   c1<T>                        → c<T>     (type alias)
 *   c2<T1, T2>                   → c2<T1, T2>
 *   s<R>                         → s<R>
 *   f1<T, R>                     → f1<T, R>
 *   f2<T1, T2, R>                → f2<T1, T2, R>
 *   T[]                          → T[]
 */
export function asValType(expr: TypeExpr): AsVal {
  if (expr.kind !== "type") {
    return "usize";
  }
  const name = rawName(expr);
  if ((AS_PRIMITIVES.has(name) && expr.args.length === 0) || name === "T") {
    return name;
  }
  if (name === "str" && expr.args.length === 0) {
    return "string";
  }
  if (name === "c1" && expr.args.length === 1) {
    return `c<${asValType(expr.args[0])}>`;
  }
  if (name === "c2" && expr.args.length === 2) {
    return `c2<${asValType(expr.args[0])}, ${asValType(expr.args[1])}>`;
  }
  if (name === "s" && expr.args.length === 1) {
    return `s<${asValType(expr.args[0])}>`;
  }
  if (name === "f1" && expr.args.length === 2) {
    return `f1<${asValType(expr.args[0])}, ${asValType(expr.args[1])}>`;
  }
  if (name === "f2" && expr.args.length === 3) {
    return `f2<${asValType(expr.args[0])}, ${asValType(expr.args[1])}, ${asValType(expr.args[2])}>`;
  }
  if (isArrayType(expr) && expr.args.length === 1) {
    return `${asValType(expr.args[0])}[]`;
  }
  if (expr.args.length > 0) {
    return `${name}<${expr.args.map(asValType).join(", ")}>`;
  }
  return name;
}

/** @deprecated Prefer {@link asValType}. */
export function wasmValType(expr: TypeExpr): AsVal {
  return asValType(expr);
}

/** @deprecated Prefer {@link asValType}; kept for unique type tokens. */
export function wasmHeapTypeName(expr: TypeExpr): string {
  return asValType(expr)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function funcTypeId(expr: TypeExpr): string {
  return wasmHeapTypeName(expr);
}

export interface AsSignature {
  id: string;
  name: string;
  params: { name: string; type: AsVal }[];
  results: { name: string; type: AsVal }[];
}

/** @deprecated Prefer {@link AsSignature}. */
export type WasmSignature = AsSignature;
export type WasmVal = AsVal;

function portAsVal(port: PortDef): AsVal {
  return asValType(port.ty);
}

/** XML `<in>` ports are AS params; `<out>` ports are AS results. */
export function blockSignature(block: BlockDef): AsSignature {
  return {
    id: block.id,
    name: block.name,
    params: block.inputs.map((port) => ({ name: asIdent(port.name), type: portAsVal(port) })),
    results: block.outputs.map((port) => ({ name: asIdent(port.name), type: portAsVal(port) })),
  };
}

/** XML ports as an AssemblyScript function header using `c<T>` aliases. */
export function asSignature(sig: AsSignature): string {
  const params = sig.params.map((port) => `${port.name}: ${port.type}`).join(", ");
  const result = sig.results.length === 0 ? "void" : sig.results.map((port) => port.type).join(", ");
  return `function ${sig.id}(${params}): ${result}`;
}

/** @deprecated Prefer {@link asSignature}. */
export function signatureWat(sig: AsSignature, _withCtx = true): string {
  return asSignature(sig);
}

export function asBlockType(sig: AsSignature): string {
  return asSignature(sig);
}

/** @deprecated Prefer {@link asBlockType}. */
export function blockTypeWat(sig: AsSignature): string {
  return asBlockType(sig);
}

export function typeDecl(id: string, params: { name: string; type: string }[], results: { name: string; type: string }[]): string {
  return asSignature({ id, name: id, params, results });
}
