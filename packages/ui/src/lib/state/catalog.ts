import { BUILTIN_CATALOGS } from "@bld/xml/blocks/builtin";
import type { Catalog, CatalogRef } from "@bld/xml/blocks/catalog";

export interface CatalogChoice extends CatalogRef {
  selected: boolean;
}

export function catalogChoices(catalog: Catalog): CatalogChoice[] {
  const associated = new Map(catalog.catalogs().map((item) => [item.file, item]));
  const files: string[] = [];
  const seen = new Set<string>();
  for (const builtin of BUILTIN_CATALOGS) {
    files.push(builtin.file);
    seen.add(builtin.file);
  }
  for (const item of catalog.catalogs()) {
    if (!seen.has(item.file)) {
      files.push(item.file);
      seen.add(item.file);
    }
  }
  return files.map((file) => {
    const selected = associated.get(file);
    const builtin = BUILTIN_CATALOGS.find((item) => item.file === file);
    return {
      file,
      id: selected?.id ?? builtin?.id ?? file,
      name: selected?.name ?? builtin?.name ?? file,
      selected: selected !== undefined,
    };
  });
}
