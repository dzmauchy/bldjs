import { Catalog as BaseCatalog } from "@bld/types/catalog";
import { parseBlocks } from "./parse";

export * from "@bld/types/catalog";

export class Catalog extends BaseCatalog {
  addXml(file: string, xml: string): void {
    this.addDoc(parseBlocks(file, xml));
  }
}
