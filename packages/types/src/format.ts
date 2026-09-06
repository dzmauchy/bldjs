import type { TypeExpr } from "./ast";

export interface FormatOptions {
  /** If true, omit namespace prefixes from type names. Defaults to true. */
  compact?: boolean;
}

function parenthesize(expr: TypeExpr, options: FormatOptions): string {
  if (expr.kind === "union" || expr.kind === "intersection") {
    return `(${formatType(expr, options)})`;
  }
  return formatType(expr, options);
}

function rawTypeName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1] ?? name;
}

/**
 * Format a TypeExpr into a human-readable display string for UI presentation.
 *
 * Examples:
 *   - c0                  → "() -> void"
 *   - c1<f32>             → "(f32) -> void"
 *   - c2<f32, f32>        → "(f32, f32) -> void"
 *   - f0<f32>             → "() -> f32"
 *   - f1<i32, bool>       → "(i32) -> bool"
 *   - Array[c1<f32>]      → "Array[(f32) -> void]"
 *   - ? (wildcard)        → "?"
 *   - ? extends Number    → "? extends Number"
 *   - ? super Integer     → "? super Integer"
 *   - A & B               → "A & B"
 *   - A | B               → "A | B"
 */
export function formatType(expr: TypeExpr, options: FormatOptions = { compact: true }): string {
  const compact = options.compact ?? true;

  switch (expr.kind) {
    case "type": {
      const raw = rawTypeName(expr.name);
      if (raw === "c0" && expr.args.length === 0) {
        return "() -> void";
      }
      if (raw === "c1" && expr.args.length === 1) {
        return `(${formatType(expr.args[0]!, options)}) -> void`;
      }
      if (raw === "c2" && expr.args.length === 2) {
        return `(${formatType(expr.args[0]!, options)}, ${formatType(expr.args[1]!, options)}) -> void`;
      }
      if (raw === "f0" && expr.args.length === 1) {
        return `() -> ${formatType(expr.args[0]!, options)}`;
      }
      if (raw === "f1" && expr.args.length === 2) {
        return `(${formatType(expr.args[0]!, options)}) -> ${formatType(expr.args[1]!, options)}`;
      }
      if (raw === "f2" && expr.args.length === 3) {
        return `(${formatType(expr.args[0]!, options)}, ${formatType(expr.args[1]!, options)}) -> ${formatType(expr.args[2]!, options)}`;
      }
      const head = compact || !expr.ns ? expr.name : (expr.name.includes(".") ? expr.name : `${expr.ns}.${expr.name}`);
      if (expr.args.length === 0) {
        return head;
      }
      return `${head}[${expr.args.map((arg) => parenthesize(arg, options)).join(", ")}]`;
    }
    case "func":
      return `(${expr.params.map((param) => formatType(param, options)).join(", ")}) -> ${formatType(expr.ret, options)}`;
    case "tuple":
      return `(${expr.elems.map((elem) => formatType(elem, options)).join(", ")})`;
    case "hole":
      return "_";
    case "self":
      return "Self";
    case "union":
      return expr.members.map((member) => formatType(member, options)).join(" | ");
    case "intersection":
      return expr.members.map((member) => formatType(member, options)).join(" & ");
    case "wildcard": {
      if (!expr.bound || !expr.variance) {
        return "?";
      }
      const keyword = expr.variance === "+" ? "extends" : "super";
      return `? ${keyword} ${formatType(expr.bound, options)}`;
    }
  }
}
