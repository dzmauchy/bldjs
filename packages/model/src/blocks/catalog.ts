import { Catalog as BaseCatalog } from "@bld/types/catalog";
import type { BlocksDoc } from "@bld/types/ast";
import { ParseError } from "./parse";
import { createTscContext, nativeTscAvailable, type TscContext } from "../tsc/host";
import { extractCatalog } from "../tsc/extract";
import { tsSyntax } from "../tsc/types";
import { displayType, type TypeExpr } from "@bld/types/ast";
import {
  hydrateBlocksDoc,
  hydrateType,
  serializeBlocksDoc,
  serializeType,
  type SerializedType,
} from "./serialize";

export * from "@bld/types/catalog";
export {
  hydrateBlocksDoc,
  hydrateType,
  serializeBlocksDoc,
  serializeType,
  type SerializedType,
};

const PREEXTRACTED = new Map<string, BlocksDoc>();

export function registerPreextracted(doc: BlocksDoc): void {
  PREEXTRACTED.set(doc.source, doc);
}

export function preextractedDoc(file: string): BlocksDoc | undefined {
  return PREEXTRACTED.get(file);
}

export class Catalog extends BaseCatalog {
  tsc?: TscContext;
  private tsFiles = new Map<string, string>();

  override reset(): void {
    super.reset();
    this.tsc?.dispose();
    this.tsc = undefined;
    this.tsFiles.clear();
  }

  addTypeScript(file: string, source: string): void {
    if (this.tsFiles.has(file) || this.sources().includes(file)) {
      throw new Error(`model \`${file}\` is already associated`);
    }
    this.tsFiles.set(file, source);
    if (!nativeTscAvailable()) {
      const doc = PREEXTRACTED.get(file);
      if (!doc) {
        throw ParseError.new(`TypeScript 7.0.2 TypeChecker is not available for \`${file}\``);
      }
      this.addDoc(doc);
      return;
    }
    this.rebuildTypeScript();
  }

  lookupCheckerType(expr: TypeExpr) {
    if (!this.tsc) {
      return undefined;
    }
    return (
      this.tsc.typeFromText(tsSyntax(expr)) ??
      this.tsc.typeFromText(displayType(expr, true)) ??
      this.tsc.typeFromText(displayType(expr, false))
    );
  }

  private rebuildTypeScript(): void {
    const files = [...this.tsFiles.entries()].map(([name, content]) => ({ name, content }));
    this.tsc?.dispose();
    this.tsc = createTscContext(files);
    for (const file of this.tsFiles.keys()) {
      if (this.sources().includes(file)) {
        this.removeSource(file);
      }
    }
    for (const file of this.tsFiles.keys()) {
      this.addDoc(extractCatalog(this.tsc, file));
    }
  }
}
