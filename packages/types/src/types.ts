import {
  type ParamDef,
  type TypeVarDef,
  type TypeExpr,
  unbounded,
  PRIMITIVE_TYPES,
  type PrimitiveType,
  BUILTIN_CONTAINER_TYPES,
  type BuiltinContainerType,
  SPECIAL_TYPES,
  type SpecialType,
  TYPE_KINDS,
  type TypeKind,
  PORT_DIRECTIONS,
  type PortDirection,
  RELATION_KINDS,
  type RelationKind,
  BLOCK_PARAMETER_KINDS,
  type BlockParameterKind,
  SETTING_KINDS,
  type SettingKind,
  VARIANCE_TYPES,
  type VarianceType,
  isPrimitiveType,
  isBuiltinContainerType,
  isSpecialType,
  isTypeKind,
  isPortDirection,
  isRelationKind,
  isBlockParameterKind,
  isSettingKind,
  isVarianceType,
} from "./ast";
import type { Catalog } from "./catalog";

export {
  type TypeVarDef,
  PRIMITIVE_TYPES,
  type PrimitiveType,
  BUILTIN_CONTAINER_TYPES,
  type BuiltinContainerType,
  SPECIAL_TYPES,
  type SpecialType,
  TYPE_KINDS,
  type TypeKind,
  PORT_DIRECTIONS,
  type PortDirection,
  RELATION_KINDS,
  type RelationKind,
  BLOCK_PARAMETER_KINDS,
  type BlockParameterKind,
  SETTING_KINDS,
  type SettingKind,
  VARIANCE_TYPES,
  type VarianceType,
  isPrimitiveType,
  isBuiltinContainerType,
  isSpecialType,
  isTypeKind,
  isPortDirection,
  isRelationKind,
  isBlockParameterKind,
  isSettingKind,
  isVarianceType,
};

export function ground(expr: TypeExpr, params: ParamDef[], catalog: Catalog): TypeExpr {
  return groundRec(expr, params, catalog);
}

function groundRec(expr: TypeExpr, params: ParamDef[], catalog: Catalog): TypeExpr {
  if (expr.asParam(params)) {
    return unbounded();
  }
  return expr.mapChildren((child) => groundRec(child, params, catalog));
}

export const PRIMITIVES: ReadonlySet<string> = new Set(PRIMITIVE_TYPES);

export function isPrimitive(name: string): boolean {
  return isPrimitiveType(name);
}
