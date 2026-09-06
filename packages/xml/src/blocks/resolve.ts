import {
  type BlockDef,
  type TypeExpr,
  generic,
  intersectionOf,
  named,
  unionOf,
} from "./ast";
import type { Catalog } from "./catalog";
import { isCompatible, isGroundType } from "./compat";
import { catalogPortName, slottedOutputType } from "./ports";
import { getTypeEngine } from "./prolog/engine";

export type Grounding = { kind: "single"; ty: TypeExpr } | { kind: "varargs"; items: TypeExpr[] };

export function pushGrounding(grounding: Grounding, ty: TypeExpr): Grounding {
  if (grounding.kind === "single") {
    return { kind: "varargs", items: [grounding.ty, ty] };
  }
  return { kind: "varargs", items: [...grounding.items, ty] };
}

export interface ResolvedPort {
  name: string;
  ty: TypeExpr;
  vararg: boolean;
  icon: string | null;
  /** False when the port still has free type variables (outputs only). */
  connectable: boolean;
}

export interface ResolvedBlock {
  defId: string;
  params: Map<string, TypeExpr>;
  inputs: ResolvedPort[];
  outputs: ResolvedPort[];
  compatible: Map<string, boolean>;
}

export function resolvedOutput(block: ResolvedBlock, name: string): TypeExpr | undefined {
  const port = block.outputs.find((item) => item.name === catalogPortName(name));
  if (!port) {
    return undefined;
  }
  return slottedOutputType(port.ty, name);
}

export function resolvedOutputPort(block: ResolvedBlock, name: string): ResolvedPort | undefined {
  return block.outputs.find((item) => item.name === catalogPortName(name));
}

export function resolvedInput(block: ResolvedBlock, name: string): TypeExpr | undefined {
  return block.inputs.find((port) => port.name === catalogPortName(name))?.ty;
}

export function isResolvedCompatible(block: ResolvedBlock, input: string): boolean {
  return block.compatible.get(catalogPortName(input)) ?? true;
}

export function isResolvedConnectable(block: ResolvedBlock, output: string): boolean {
  return block.outputs.find((port) => port.name === catalogPortName(output))?.connectable ?? false;
}

export interface ResolveOptions {
  strategy?: "intersection" | "union";
  commonTypeStrategy?: "intersection" | "union";
}

/**
 * Simplify an intersection of types against an optional catalog.
 * If A is a subtype of B (A <: B), then A & B simplifies to A because A already satisfies B.
 */
export function simplifyIntersection(types: TypeExpr[], catalog?: Catalog): TypeExpr {
  const base = intersectionOf(types);
  if (base.kind !== "intersection" || !catalog) {
    return base;
  }
  const members = [...base.members];
  const simplified = members.filter((member, i) => {
    return !members.some((other, j) => {
      if (i === j) {
        return false;
      }
      if (other.equals(member)) {
        return false;
      }
      return isCompatible(catalog, [], member, other);
    });
  });
  return intersectionOf(simplified);
}

/**
 * Simplify a union of types against an optional catalog.
 * If A is a subtype of B (A <: B), then A | B simplifies to B because B subsumes A.
 */
export function simplifyUnion(types: TypeExpr[], catalog?: Catalog): TypeExpr {
  const base = unionOf(types);
  if (base.kind !== "union" || !catalog) {
    return base;
  }
  const members = [...base.members];
  const simplified = members.filter((member, i) => {
    return !members.some((other, j) => {
      if (i === j) {
        return false;
      }
      if (other.equals(member)) {
        return false;
      }
      return isCompatible(catalog, [], other, member);
    });
  });
  return unionOf(simplified);
}

export function inferCommonType(
  types: TypeExpr[],
  options?: { strategy?: "intersection" | "union"; catalog?: Catalog },
): TypeExpr {
  const strategy = options?.strategy ?? "intersection";
  return strategy === "intersection"
    ? simplifyIntersection(types, options?.catalog)
    : simplifyUnion(types, options?.catalog);
}

export function inferIntersection(types: TypeExpr[], catalog?: Catalog): TypeExpr {
  return simplifyIntersection(types, catalog);
}

export function inferUnion(types: TypeExpr[], catalog?: Catalog): TypeExpr {
  return simplifyUnion(types, catalog);
}

export class TypeResolver {
  constructor(private readonly catalog: Catalog) {}

  inferCommonTypes(
    types: TypeExpr[],
    strategy: "intersection" | "union" = "intersection",
  ): TypeExpr {
    return inferCommonType(types, { strategy, catalog: this.catalog });
  }

  async resolve(block: BlockDef, grounded: Map<string, Grounding>): Promise<ResolvedBlock> {
    const engine = await getTypeEngine();
    const inferred = await engine.infer(block, grounded, this.catalog);
    const selfTy = selfType(block);
    const byIn = new Map(inferred.inputs.map((port) => [port.name, port]));
    const byOut = new Map(inferred.outputs.map((port) => [port.name, port]));
    return {
      defId: block.id,
      params: inferred.vars,
      inputs: block.inputs.map((port) => {
        const found = byIn.get(port.name);
        return {
          name: port.name,
          ty: (found?.ty ?? port.ty).replaceSelf(selfTy),
          vararg: port.vararg,
          icon: port.icon,
          connectable: true,
        };
      }),
      outputs: block.outputs.map((port) => {
        const found = byOut.get(port.name);
        const ty = (found?.ty ?? port.ty).replaceSelf(selfTy);
        return {
          name: port.name,
          ty,
          vararg: port.vararg,
          icon: port.icon,
          connectable: found?.connectable ?? isGroundType(ty),
        };
      }),
      compatible: inferred.compatible,
    };
  }
}

export function selfType(block: BlockDef): TypeExpr {
  const args = block.vars.map((typeVar) => named(typeVar.name));
  if (args.length === 0) {
    return named(block.ns);
  }
  return generic(block.ns, args);
}
