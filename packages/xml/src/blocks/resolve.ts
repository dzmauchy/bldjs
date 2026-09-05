import {
  type BlockDef,
  type PortDef,
  type TypeExpr,
  type TypeRelationDef,
  generic,
  intersectionOf,
  named,
  unionOf,
} from "./ast";
import type { Catalog } from "./catalog";
import { isCompatible, isCompatibleWith } from "./compat";
import { catalogPortName, slottedOutputType } from "./ports";
import { ground } from "./types";

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
}

export interface ResolvedBlock {
  defId: string;
  params: Map<string, TypeExpr>;
  inputs: ResolvedPort[];
  outputs: ResolvedPort[];
  compatible: Map<string, boolean>;
}

export function resolvedOutput(block: ResolvedBlock, name: string): TypeExpr | undefined {
  const ty = block.outputs.find((port) => port.name === catalogPortName(name))?.ty;
  return ty ? slottedOutputType(ty, name) : undefined;
}

export function resolvedInput(block: ResolvedBlock, name: string): TypeExpr | undefined {
  return block.inputs.find((port) => port.name === catalogPortName(name))?.ty;
}

export function isResolvedCompatible(block: ResolvedBlock, input: string): boolean {
  return block.compatible.get(catalogPortName(input)) ?? true;
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

  resolve(
    block: BlockDef,
    grounded: Map<string, Grounding>,
    options?: ResolveOptions,
  ): ResolvedBlock {
    const selfTy = selfType(block);
    const matched = new Map<string, TypeExpr[]>();
    const matchedPorts = new Map<string, Set<string>>();
    const compatible = new Map<string, boolean>();

    for (const port of block.inputs) {
      const grounding = grounded.get(port.name);
      if (!grounding) {
        continue;
      }
      const formal = port.ty.replaceSelf(selfTy);
      const onMatch = (name: string, ty: TypeExpr) => {
        const existing = matched.get(name);
        if (existing) {
          existing.push(ty);
        } else {
          matched.set(name, [ty]);
        }
        let portSet = matchedPorts.get(name);
        if (!portSet) {
          portSet = new Set();
          matchedPorts.set(name, portSet);
        }
        portSet.add(port.name);
      };
      let ok: boolean;
      if (grounding.kind === "single") {
        ok = isCompatibleWith(this.catalog, block.params, formal, grounding.ty, onMatch);
      } else {
        ok = grounding.items.every((actual) =>
          isCompatibleWith(this.catalog, block.params, formal, actual, onMatch),
        );
      }
      compatible.set(port.name, ok);
    }

    const bindings = new Map<string, TypeExpr>();
    const params = new Map<string, TypeExpr>();
    for (const param of block.params) {
      const found = matched.get(param.name);
      const portSet = matchedPorts.get(param.name);
      let inferred: TypeExpr | undefined;

      if (!found || found.length === 0) {
        inferred = undefined;
      } else if (found.length === 1) {
        inferred = found[0];
      } else {
        const blockParamRelation = block.relations?.find(
          (r) => r.param === param.name || r.name === param.name,
        )?.kind;
        const requestedStrategy =
          options?.commonTypeStrategy ??
          options?.strategy ??
          param.relation ??
          blockParamRelation;

        if (requestedStrategy === "union") {
          inferred = simplifyUnion(found, this.catalog);
        } else if (requestedStrategy === "intersection") {
          inferred = simplifyIntersection(found, this.catalog);
        } else if (portSet && portSet.size > 1) {
          // Multiple distinct inputs ground the same type parameter: infer as type intersection!
          inferred = simplifyIntersection(found, this.catalog);
        } else {
          inferred = simplifyUnion(found, this.catalog);
        }
      }

      if (inferred) {
        bindings.set(param.name, inferred);
        params.set(param.name, inferred);
      } else {
        params.set(param.name, ground(named(param.name), block.params, this.catalog));
      }
    }

    const getGroundedInputType = (name: string): TypeExpr | undefined => {
      const g = grounded.get(name);
      if (!g) {
        return undefined;
      }
      return g.kind === "single" ? g.ty : unionOf(g.items);
    };

    const resolvePort = (port: PortDef): ResolvedPort => {
      const replaced = port.ty.replaceSelf(selfTy);
      let substituted = replaced.subst(bindings);

      // 1. Direct port relatesTo/relation attribute
      if (port.relatesTo) {
        const inNames = port.relatesTo.split(",").map((s) => s.trim());
        const inputTys = inNames
          .map(getGroundedInputType)
          .filter((ty): ty is TypeExpr => ty !== undefined);
        if (inputTys.length > 0) {
          const kind = port.relation ?? "intersection";
          if (kind === "intersection") {
            substituted = simplifyIntersection(inputTys, this.catalog);
          } else if (kind === "union") {
            substituted = simplifyUnion(inputTys, this.catalog);
          } else if (kind === "identity" && inputTys[0]) {
            substituted = inputTys[0];
          }
        }
      }

      // 2. Block-level relations between input types and output types
      if (block.relations) {
        for (const rel of block.relations) {
          const outNames = (
            rel.to ??
            rel.output ??
            (rel.outputs ? rel.outputs.join(",") : "")
          )
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          if (outNames.includes(port.name)) {
            const inNames = (
              rel.from ??
              rel.input ??
              (rel.inputs ? rel.inputs.join(",") : "")
            )
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);

            const inputTys = (
              inNames.length > 0
                ? inNames.map(getGroundedInputType)
                : block.inputs.map((inp) => getGroundedInputType(inp.name))
            ).filter((ty): ty is TypeExpr => ty !== undefined);

            if (inputTys.length > 0) {
              if (rel.kind === "intersection") {
                substituted = simplifyIntersection(inputTys, this.catalog);
              } else if (rel.kind === "union") {
                substituted = simplifyUnion(inputTys, this.catalog);
              } else if (rel.kind === "identity" && inputTys[0]) {
                substituted = inputTys[0];
              }
            }
          }
        }
      }

      return {
        name: port.name,
        ty: ground(substituted, block.params, this.catalog),
        vararg: port.vararg,
        icon: port.icon,
      };
    };

    return {
      defId: block.id,
      params,
      inputs: block.inputs.map(resolvePort),
      outputs: block.outputs.map(resolvePort),
      compatible,
    };
  }
}

export function selfType(block: BlockDef): TypeExpr {
  const args = block.params.map((param) => named(param.name));
  if (args.length === 0) {
    return named(block.ns);
  }
  return generic(block.ns, args);
}

