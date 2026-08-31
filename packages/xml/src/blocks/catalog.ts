import {
  type BlockDef,
  type BlocksDoc,
  type LibraryRef,
  type Namespace,
  type ParamDef,
  type TypeDef,
  type TypeExpr,
  named,
  NamedType,
} from "./ast";
import { ParseError, parseBlocks } from "./parse";

export class Catalog {
  libraries: LibraryRef[] = [];
  namespaces = new Map<string, Namespace>();
  private types: TypeDef[] = [];
  private typeByName = new Map<string, number[]>();
  private blockList: BlockDef[] = [];
  private blockById = new Map<string, number>();
  private sourceList: string[] = [];

  sources(): string[] {
    return this.sourceList;
  }

  typeDefs(): TypeDef[] {
    return this.types;
  }

  blocks(): BlockDef[] {
    return this.blockList;
  }

  block(id: string): BlockDef | undefined {
    const index = this.blockById.get(id);
    return index === undefined ? undefined : this.blockList[index];
  }

  addXml(file: string, xml: string): void {
    this.addDoc(parseBlocks(file, xml));
  }

  addDoc(doc: BlocksDoc): void {
    if (this.sourceList.includes(doc.source)) {
      throw ParseError.new(`model \`${doc.source}\` is already associated`);
    }
    for (const block of doc.blocks) {
      if (this.blockById.has(block.id)) {
        throw ParseError.new(`duplicate block id \`${block.id}\` (from ${doc.source})`);
      }
    }
    this.libraries.push(...doc.libraries);
    for (const namespace of doc.namespaces) {
      this.namespaces.set(namespace.id, namespace);
    }
    for (const typeDef of doc.types) {
      const index = this.types.length;
      this.pushTypeIndex(typeDef.name, index);
      if (typeDef.ns) {
        this.pushTypeIndex(`${typeDef.ns}.${typeDef.name}`, index);
      }
      this.types.push(typeDef);
    }
    for (const block of doc.blocks) {
      const index = this.blockList.length;
      this.blockById.set(block.id, index);
      this.blockList.push(block);
    }
    this.sourceList.push(doc.source);
  }

  removeSource(file: string): void {
    this.types = this.types.filter((typeDef) => typeDef.source !== file);
    this.blockList = this.blockList.filter((block) => block.source !== file);
    this.rebuildIndexes();
    this.sourceList = this.sourceList.filter((source) => source !== file);
  }

  private pushTypeIndex(key: string, index: number): void {
    const existing = this.typeByName.get(key);
    if (existing) {
      existing.push(index);
    } else {
      this.typeByName.set(key, [index]);
    }
  }

  private rebuildIndexes(): void {
    this.typeByName.clear();
    this.blockById.clear();
    this.types.forEach((typeDef, index) => {
      this.pushTypeIndex(typeDef.name, index);
      if (typeDef.ns) {
        this.pushTypeIndex(`${typeDef.ns}.${typeDef.name}`, index);
      }
    });
    this.blockList.forEach((block, index) => {
      this.blockById.set(block.id, index);
    });
  }

  namespaceLabel(id: string): string {
    const namespace = this.namespaces.get(id);
    if (namespace && namespace.name.length > 0) {
      return namespace.name;
    }
    return id;
  }

  /** Declared parent, or the longest declared dotted prefix (`com.dauch.cs.*` → `com.dauch.cs`). */
  namespaceParent(id: string): string | null {
    const declared = this.namespaces.get(id)?.parent;
    if (declared) {
      return declared;
    }
    const parts = id.split(".");
    while (parts.length > 1) {
      parts.pop();
      const prefix = parts.join(".");
      if (this.namespaces.has(prefix)) {
        return prefix;
      }
    }
    return null;
  }

  findType(name: string, nsHint?: string | null): TypeDef | undefined {
    if (nsHint) {
      const qualified = `${nsHint}.${name}`;
      const indices = this.typeByName.get(qualified);
      if (indices && indices.length > 0) {
        return this.types[indices[0]];
      }
    }
    const indices = this.typeByName.get(name);
    if (!indices) {
      return undefined;
    }
    if (nsHint) {
      const match = indices.find((index) => this.types[index].ns === nsHint);
      if (match !== undefined) {
        return this.types[match];
      }
    }
    if (indices.length === 1) {
      return this.types[indices[0]];
    }
    return this.types.find((typeDef, index) => indices.includes(index) && typeDef.ns === null)
      ?? this.types[indices[0]];
  }

  expandAlias(ty: TypeExpr): TypeExpr | undefined {
    if (ty.kind !== "type") {
      return undefined;
    }
    const typeDef = this.findType(ty.name, ty.ns);
    if (!typeDef?.alias) {
      return undefined;
    }
    return substParams(typeDef.alias, typeDef.params, ty.args);
  }

  asSupertype(actual: TypeExpr, targetName: string, targetNs?: string | null): TypeExpr | undefined {
    return this.asSupertypeRec(actual, targetName, targetNs ?? null, []);
  }

  private asSupertypeRec(
    actual: TypeExpr,
    targetName: string,
    targetNs: string | null,
    stack: string[],
  ): TypeExpr | undefined {
    if (actual.kind !== "type") {
      return undefined;
    }
    if (sameRaw(actual.name, actual.ns, targetName, targetNs)) {
      return actual;
    }
    const key = `${actual.ns ?? ""}::${actual.name}`;
    if (stack.includes(key)) {
      return undefined;
    }
    stack.push(key);
    const typeDef = this.findType(actual.name, actual.ns);
    let result: TypeExpr | undefined;
    if (typeDef) {
      for (const ancestor of typeDef.ancestors) {
        const projected = substParams(ancestor, typeDef.params, actual.args);
        result = this.asSupertypeRec(projected, targetName, targetNs, stack);
        if (result) {
          break;
        }
      }
    }
    stack.pop();
    return result;
  }

  isRawSubtype(
    childName: string,
    childNs: string | null | undefined,
    parentName: string,
    parentNs: string | null | undefined,
  ): boolean {
    return (
      this.asSupertype(new NamedType(childName, childNs ?? null, []), parentName, parentNs) !== undefined
    );
  }
}

export function substParams(expr: TypeExpr, params: ParamDef[], args: TypeExpr[]): TypeExpr {
  if (params.length === 0) {
    return expr;
  }
  const bindings = new Map<string, TypeExpr>();
  params.forEach((param, index) => {
    bindings.set(param.name, args[index] ?? named(param.name));
  });
  return expr.subst(bindings);
}

export function sameRaw(
  aName: string,
  aNs: string | null | undefined,
  bName: string,
  bNs: string | null | undefined,
): boolean {
  if (aName === bName) {
    if (aNs != null && bNs != null) {
      return aNs === bNs || aNs.length === 0 || bNs.length === 0;
    }
    return true;
  }
  const aFull = aNs && aNs.length > 0 && !aName.includes(".") ? `${aNs}.${aName}` : aName;
  const bFull = bNs && bNs.length > 0 && !bName.includes(".") ? `${bNs}.${bName}` : bName;
  return (
    aFull === bFull ||
    (aFull.endsWith(`.${bName}`) && bNs == null) ||
    (bFull.endsWith(`.${aName}`) && aNs == null)
  );
}

