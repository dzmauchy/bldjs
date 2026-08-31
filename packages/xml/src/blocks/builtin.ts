import typesXml from "../resources/models/types.xml?raw";
import controlSystemsXml from "../resources/models/control-systems.xml?raw";
import fixturesXml from "./fixtures.xml?raw";
import { ParseError, parseBlocks } from "./parse";
import type { CatalogRef } from "./catalog";
import { Catalog } from "./catalog";
import type { Diagram, XmlSource } from "./diagram";

export const TYPES_XML = typesXml;
export const CONTROL_SYSTEMS_XML = controlSystemsXml;
export const FIXTURES_XML = fixturesXml;

export const BUILTIN_MODELS: ReadonlyArray<readonly [string, string]> = [
  ["types.xml", TYPES_XML],
  ["control-systems.xml", CONTROL_SYSTEMS_XML],
];

export interface BuiltinCatalog extends CatalogRef {
  xml: string;
}

export const BUILTIN_CATALOGS: readonly BuiltinCatalog[] = BUILTIN_MODELS.map(([file, xml]) => {
  const doc = parseBlocks(file, xml);
  return { file, xml, id: doc.id, name: doc.name };
});

const BUILTIN_BY_FILE = new Map(BUILTIN_CATALOGS.map((catalog) => [catalog.file, catalog]));

export function builtinCatalog(file: string): BuiltinCatalog | undefined {
  return BUILTIN_BY_FILE.get(file);
}

export function catalogXml(file: string): string | undefined {
  return BUILTIN_BY_FILE.get(file)?.xml;
}

export function xmlSourcesForFiles(files: readonly string[]): XmlSource[] {
  return files.map((file) => {
    const xml = catalogXml(file);
    if (xml === undefined) {
      throw ParseError.new(`unknown catalog \`${file}\``);
    }
    return { name: file, content: xml };
  });
}

export function catalogFromFiles(files: readonly string[]): Catalog {
  const catalog = new Catalog();
  for (const source of xmlSourcesForFiles(files)) {
    catalog.addXml(source.name, source.content);
  }
  return catalog;
}

export function associateBuiltinModels(diagram: Diagram): void {
  associateCatalogFiles(
    diagram,
    BUILTIN_CATALOGS.map((catalog) => catalog.file),
  );
}

export function associateCatalogFiles(diagram: Diagram, files: readonly string[]): void {
  for (const source of xmlSourcesForFiles(files)) {
    diagram.associateXml(source.name, source.content);
  }
}

/** Extra blocks used only by unit tests (array, flow, type constructors). */
export function associateFixtureModels(diagram: Diagram): void {
  associateBuiltinModels(diagram);
  diagram.associateXml("fixtures.xml", FIXTURES_XML);
}
