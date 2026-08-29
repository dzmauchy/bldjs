import { type BlockDef, type PortDef, type TypeExpr, generic, named, unionOf } from "./ast";
import type { Catalog } from "./catalog";
import { isCompatibleWith } from "./compat";
import { ground, replaceSelf, subst } from "./types";

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
  return block.outputs.find((port) => port.name === name)?.ty;
}

export function resolvedInput(block: ResolvedBlock, name: string): TypeExpr | undefined {
  return block.inputs.find((port) => port.name === name)?.ty;
}

export function isResolvedCompatible(block: ResolvedBlock, input: string): boolean {
  return block.compatible.get(input) ?? true;
}

export class TypeResolver {
  constructor(private readonly catalog: Catalog) {}

  resolve(block: BlockDef, grounded: Map<string, Grounding>): ResolvedBlock {
    const selfTy = selfType(block);
    const matched = new Map<string, TypeExpr[]>();
    const compatible = new Map<string, boolean>();

    for (const port of block.inputs) {
      const grounding = grounded.get(port.name);
      if (!grounding) {
        continue;
      }
      const formal = replaceSelf(port.ty, selfTy);
      const onMatch = (name: string, ty: TypeExpr) => {
        const existing = matched.get(name);
        if (existing) {
          existing.push(ty);
        } else {
          matched.set(name, [ty]);
        }
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
      const inferred =
        !found || found.length === 0 ? undefined : found.length === 1 ? found[0] : unionOf(found);
      if (inferred) {
        bindings.set(param.name, inferred);
        params.set(param.name, inferred);
      } else {
        params.set(param.name, ground(named(param.name), block.params, this.catalog));
      }
    }

    const resolvePort = (port: PortDef): ResolvedPort => {
      const replaced = replaceSelf(port.ty, selfTy);
      const substituted = subst(replaced, bindings);
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
