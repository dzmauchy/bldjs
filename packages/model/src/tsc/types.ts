import {
  type TypeExpr,
  TupleType,
  arrayOf,
  funcType,
  generic,
  intersectionOf,
  named,
  unbounded,
  unionOf,
} from "@bld/types/ast";
import { displayType } from "@bld/types/ast";
import { SignatureKind, TypeFlags, type Checker, type Type } from "./host";

export function tsSyntax(expr: TypeExpr): string {
  switch (expr.kind) {
    case "type":
      if (expr.args.length === 0) {
        return expr.name;
      }
      return `${expr.name}<${expr.args.map(tsSyntax).join(", ")}>`;
    case "func":
      return `(${expr.params.map((param, index) => `arg${index}: ${tsSyntax(param)}`).join(", ")}) => ${tsSyntax(expr.ret)}`;
    case "tuple":
      return `[${expr.elems.map(tsSyntax).join(", ")}]`;
    case "union":
      return expr.members.map(tsSyntax).join(" | ");
    case "intersection":
      return expr.members.map(tsSyntax).join(" & ");
    case "hole":
      return "any";
    case "self":
      return "this";
    case "wildcard":
      return "any";
  }
}

export function typeFromTs(checker: Checker, type: Type): TypeExpr {
  if ((type as any).isErrorType?.() || ((type.flags & TypeFlags.Any) !== 0 && (type as any).intrinsicName === "error")) {
    return unbounded();
  }

  const alias = (type as any).getAliasSymbol ? (type as any).getAliasSymbol() : type.aliasSymbol;
  if (alias) {
    const aliasName = alias.name;
    const rawAliasArgs: readonly Type[] = (type as any).getAliasTypeArguments
      ? (type as any).getAliasTypeArguments()
      : (type.aliasTypeArguments ?? []);
    const aliasArgs = rawAliasArgs.map((arg) => typeFromTs(checker, arg));
    if (aliasName === "c" && aliasArgs.length === 1) {
      return funcType(aliasArgs, named("void"));
    }
    if (aliasName === "c0") {
      return funcType([], named("void"));
    }
    if (aliasName === "c1" && aliasArgs.length === 1) {
      return funcType(aliasArgs, named("void"));
    }
    if (aliasName === "c2" && aliasArgs.length === 2) {
      return funcType(aliasArgs, named("void"));
    }
    if (aliasName === "f0" && aliasArgs.length === 1) {
      return funcType([], aliasArgs[0]!);
    }
    if (aliasName === "f1" && aliasArgs.length === 2) {
      return funcType([aliasArgs[0]!], aliasArgs[1]!);
    }
    if (aliasName === "f2" && aliasArgs.length === 3) {
      return funcType([aliasArgs[0]!, aliasArgs[1]!], aliasArgs[2]!);
    }
    if ((aliasName === "Multiplexed" || aliasName === "Array") && aliasArgs.length === 1) {
      return arrayOf(aliasArgs[0]!);
    }
    if (aliasArgs.length > 0) {
      return generic(aliasName, aliasArgs);
    }
    return named(aliasName);
  }

  const rawFlags = Number(type.flags);
  if (rawFlags & TypeFlags.Void || rawFlags & TypeFlags.Undefined) {
    return named("void");
  }
  if (rawFlags & TypeFlags.Never) {
    return named("never");
  }
  if (rawFlags & TypeFlags.TypeParameter || type.isTypeParameter()) {
    return named(type.getSymbol()?.name ?? "T");
  }
  if ((type as any).isUnionType?.() || (type as any).isUnion?.()) {
    const members: readonly Type[] = (type as any).getTypes ? (type as any).getTypes() : (type as any).types ?? [];
    return unionOf(members.map((member) => typeFromTs(checker, member)));
  }
  if ((type as any).isIntersectionType?.() || (type as any).isIntersection?.()) {
    const members: readonly Type[] = (type as any).getTypes ? (type as any).getTypes() : (type as any).types ?? [];
    return intersectionOf(members.map((member) => typeFromTs(checker, member)));
  }
  if (rawFlags & TypeFlags.Number) {
    return named("number");
  }
  if (rawFlags & TypeFlags.Boolean) {
    return named("bool");
  }
  if (rawFlags & TypeFlags.String) {
    return named("string");
  }

  if (checker.isArrayType(type)) {
    const args: readonly Type[] = (type as any).typeArguments ?? ((type as any).isTypeReference?.() ? checker.getTypeArguments(type as any) : []);
    return arrayOf(args[0] ? typeFromTs(checker, args[0]) : unbounded());
  }

  if (checker.isTupleType(type) || (type as any).isTupleType?.()) {
    const args: readonly Type[] = (type as any).typeArguments ?? ((type as any).isTypeReference?.() ? checker.getTypeArguments(type as any) : []);
    return new TupleType(args.map((arg) => typeFromTs(checker, arg)));
  }

  const signatures = checker.getSignaturesOfType(type, SignatureKind.Call);
  if (signatures.length > 0) {
    const signature = signatures[0]!;
    const params = signature.getParameters().map((symbol, index) => {
      const paramType = (checker as any).getParameterType
        ? (checker as any).getParameterType(signature, index)
        : (symbol.valueDeclaration ? checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration) : unbounded());
      return paramType ? typeFromTs(checker, paramType) : unbounded();
    });
    const ret = checker.getReturnTypeOfSignature(signature);
    return funcType(params, ret ? typeFromTs(checker, ret) : named("void"));
  }

  const symbol = (type as any).getSymbol ? (type as any).getSymbol() : undefined;
  const name = symbol?.name ?? checker.typeToString(type);
  const args: readonly Type[] = (type as any).typeArguments ?? ((type as any).isTypeReference?.() ? checker.getTypeArguments(type as any) : []);
  if ((name === "Multiplexed" || name === "Array") && args.length === 1) {
    return arrayOf(typeFromTs(checker, args[0]!));
  }
  if (args.length > 0) {
    return generic(name, args.map((arg) => typeFromTs(checker, arg)));
  }
  return named(name);
}

export function registerCheckerType(checker: Checker, type: Type, register: (text: string, ty: Type) => void): TypeExpr {
  const expr = typeFromTs(checker, type);
  register(checker.typeToString(type), type);
  register(tsSyntax(expr), type);
  register(displayType(expr), type);
  return expr;
}
