import { Catalog as BaseCatalog } from "@bld/types/catalog";
import { parseCatalog } from "./parse";

export * from "@bld/types/catalog";

export class Catalog extends BaseCatalog {
  addJson(file: string, json: string | unknown): void {
    this.addDoc(parseCatalog(file, json));
  }
}
