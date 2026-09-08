import {
  type BlocksDoc,
  type TypeExpr,
  NamedType,
  TupleType,
  WildcardType,
  SelfType,
  funcType,
  intersectionOf,
  unbounded,
  unionOf,
} from "@bld/types/ast";

export type SerializedType =
  | { kind: "type"; name: string; ns: string | null; args: SerializedType[] }
  | { kind: "func"; params: SerializedType[]; ret: SerializedType }
  | { kind: "tuple"; elems: SerializedType[] }
  | { kind: "union"; members: SerializedType[] }
  | { kind: "intersection"; members: SerializedType[] }
  | { kind: "hole" }
  | { kind: "self" }
  | { kind: "wildcard"; bound: SerializedType | null; variance: "+" | "-" | null };

export function serializeType(expr: TypeExpr): SerializedType {
  switch (expr.kind) {
    case "type":
      return { kind: "type", name: expr.name, ns: expr.ns, args: expr.args.map(serializeType) };
    case "func":
      return { kind: "func", params: expr.params.map(serializeType), ret: serializeType(expr.ret) };
    case "tuple":
      return { kind: "tuple", elems: expr.elems.map(serializeType) };
    case "union":
      return { kind: "union", members: expr.members.map(serializeType) };
    case "intersection":
      return { kind: "intersection", members: expr.members.map(serializeType) };
    case "hole":
      return { kind: "hole" };
    case "self":
      return { kind: "self" };
    case "wildcard":
      return {
        kind: "wildcard",
        bound: expr.bound ? serializeType(expr.bound) : null,
        variance: expr.variance,
      };
  }
}

export function hydrateType(raw: SerializedType): TypeExpr {
  switch (raw.kind) {
    case "type":
      return new NamedType(raw.name, raw.ns, raw.args.map(hydrateType));
    case "func":
      return funcType(raw.params.map(hydrateType), hydrateType(raw.ret));
    case "tuple":
      return new TupleType(raw.elems.map(hydrateType));
    case "union":
      return unionOf(raw.members.map(hydrateType));
    case "intersection":
      return intersectionOf(raw.members.map(hydrateType));
    case "hole":
      return unbounded();
    case "self":
      return new SelfType();
    case "wildcard":
      return new WildcardType(raw.bound ? hydrateType(raw.bound) : null, raw.variance);
  }
}

export function serializeBlocksDoc(doc: BlocksDoc): unknown {
  return {
    id: doc.id,
    name: doc.name,
    icon: doc.icon,
    attributes: doc.attributes,
    namespaces: doc.namespaces,
    source: doc.source,
    types: doc.types.map((typeDef) => ({
      ...typeDef,
      vars: typeDef.vars,
      params: typeDef.params,
      ancestors: typeDef.ancestors.map(serializeType),
      extends: typeDef.extends ? serializeType(typeDef.extends) : null,
    })),
    blocks: doc.blocks.map((block) => ({
      ...block,
      factory: block.factory,
      inputs: block.inputs.map((port) => ({ ...port, ty: serializeType(port.ty) })),
      outputs: block.outputs.map((port) => ({ ...port, ty: serializeType(port.ty) })),
    })),
  };
}

export function hydrateBlocksDoc(raw: unknown): BlocksDoc {
  const doc = raw as Record<string, unknown>;
  const types = Array.isArray(doc.types) ? doc.types : [];
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  return {
    id: String(doc.id ?? ""),
    name: String(doc.name ?? ""),
    icon: typeof doc.icon === "string" ? doc.icon : null,
    attributes: Array.isArray(doc.attributes) ? (doc.attributes as BlocksDoc["attributes"]) : [],
    namespaces: Array.isArray(doc.namespaces) ? (doc.namespaces as BlocksDoc["namespaces"]) : [],
    source: String(doc.source ?? ""),
    types: types.map((item) => {
      const typeDef = item as Record<string, unknown>;
      return {
        ...(typeDef as object),
        ancestors: Array.isArray(typeDef.ancestors)
          ? typeDef.ancestors.map((ty) => hydrateType(ty as SerializedType))
          : [],
        extends: typeDef.extends ? hydrateType(typeDef.extends as SerializedType) : null,
      } as BlocksDoc["types"][number];
    }),
    blocks: blocks.map((item) => {
      const block = item as Record<string, unknown>;
      const inputs = Array.isArray(block.inputs) ? block.inputs : [];
      const outputs = Array.isArray(block.outputs) ? block.outputs : [];
      return {
        ...(block as object),
        inputs: inputs.map((port) => {
          const node = port as Record<string, unknown>;
          return { ...node, ty: hydrateType(node.ty as SerializedType) };
        }),
        outputs: outputs.map((port) => {
          const node = port as Record<string, unknown>;
          return { ...node, ty: hydrateType(node.ty as SerializedType) };
        }),
      } as BlocksDoc["blocks"][number];
    }),
  };
}
