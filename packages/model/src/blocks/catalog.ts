import { Catalog as BaseCatalog } from "@bld/types/catalog";
import type { BlocksDoc } from "@bld/types/ast";
import { ParseError } from "./parse";
import { createTscContext, type TscContext } from "../tsc/host";
import { extractCatalog } from "../tsc/extract";
import { tsSyntax } from "../tsc/types";
import { displayType, type TypeExpr } from "@bld/types/ast";

export * from "@bld/types/catalog";

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
