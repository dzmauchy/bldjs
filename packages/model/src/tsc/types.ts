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
  if (type.isErrorType()) {
    return unbounded();
  }
  if (type.flags & TypeFlags.Void || type.flags & TypeFlags.Undefined) {
    return named("void");
  }
  if (type.flags & TypeFlags.Never) {
    return named("never");
  }
  if (type.flags & TypeFlags.TypeParameter || type.isTypeParameter()) {
    return named(type.getSymbol()?.name ?? "T");
  }
  if (type.isUnionType()) {
    return unionOf((type.getTypes() ?? []).map((member) => typeFromTs(checker, member)));
  }
  if (type.isIntersectionType()) {
    return intersectionOf((type.getTypes() ?? []).map((member) => typeFromTs(checker, member)));
  }
  if (type.flags & TypeFlags.Number) {
    return named("number");
  }
  if (type.flags & TypeFlags.Boolean) {
    return named("bool");
  }
  if (type.flags & TypeFlags.String) {
    return named("string");
  }

  const alias = type.getAliasSymbol();
  if (alias) {
    const aliasName = alias.name;
    const aliasArgs = type.getAliasTypeArguments().map((arg) => typeFromTs(checker, arg));
    if (aliasName === "c" && aliasArgs.length === 1) {
      return funcType(aliasArgs, named("void"));
    }
    if (aliasName === "c0") {
      return funcType([], named("void"));
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

  if (checker.isArrayType(type)) {
    const args = type.isTypeReference() ? checker.getTypeArguments(type) : [];
    return arrayOf(args[0] ? typeFromTs(checker, args[0]) : unbounded());
  }

  if (checker.isTupleType(type) || type.isTupleType()) {
    const args = type.isTypeReference() ? checker.getTypeArguments(type) : [];
    return new TupleType(args.map((arg) => typeFromTs(checker, arg)));
  }

  const signatures = checker.getSignaturesOfType(type, SignatureKind.Call);
  if (signatures.length > 0) {
    const signature = signatures[0]!;
    const params = signature.getParameters().map((_symbol, index) => {
      const paramType = checker.getParameterType(signature, index);
      return paramType ? typeFromTs(checker, paramType) : unbounded();
    });
    const ret = checker.getReturnTypeOfSignature(signature);
    return funcType(params, ret ? typeFromTs(checker, ret) : named("void"));
  }

  const symbol = type.getSymbol();
  const name = symbol?.name ?? checker.typeToString(type);
  const args = type.isTypeReference() ? checker.getTypeArguments(type) : [];
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
