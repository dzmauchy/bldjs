import modelSource from "../resources/models/model.ts?raw";
import librarySource from "../resources/models/library.ts?raw";
import fixturesSource from "../resources/models/fixtures.ts?raw";
import { ParseError } from "./parse";
import { Catalog, type CatalogRef } from "./catalog";
import type { Diagram, ModelSource } from "./diagram";

export const MODEL_TS = modelSource;
export const LIBRARY_TS = librarySource;
export const FIXTURES_TS = fixturesSource;
export const MODEL_FILE = "model.ts";
export const LIBRARY_FILE = "library.ts";
export const FIXTURES_FILE = "fixtures.ts";

export const BUILTIN_MODELS: ReadonlyArray<readonly [string, string]> = [[MODEL_FILE, MODEL_TS]];

export interface BuiltinCatalog extends CatalogRef {
  source: string;
}

export const BUILTIN_CATALOGS: readonly BuiltinCatalog[] = [
  { file: MODEL_FILE, source: MODEL_TS, id: "cs", name: "Control Systems" },
];

const BUILTIN_BY_FILE = new Map(BUILTIN_CATALOGS.map((catalog) => [catalog.file, catalog]));

export function builtinCatalog(file: string): BuiltinCatalog | undefined {
  return BUILTIN_BY_FILE.get(file);
}

export function catalogSource(file: string): string | undefined {
  if (file === FIXTURES_FILE) {
    return FIXTURES_TS;
  }
  if (file === LIBRARY_FILE) {
    return LIBRARY_TS;
  }
  return BUILTIN_BY_FILE.get(file)?.source;
}

export function catalogSourcesForFiles(files: readonly string[]): ModelSource[] {
  return files.map((file) => {
    const source = catalogSource(file);
    if (source === undefined) {
      throw ParseError.new(`unknown catalog \`${file}\``);
    }
    return { name: file, content: source };
  });
}

export function catalogFromFiles(files: readonly string[]): Catalog {
  const catalog = new Catalog();
  for (const source of catalogSourcesForFiles(files)) {
    catalog.addTypeScript(source.name, source.content);
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
  for (const source of catalogSourcesForFiles(files)) {
    diagram.associateTypeScript(source.name, source.content);
  }
}

/** Extra blocks used only by unit tests (array, flow, type constructors). */
export function associateFixtureModels(diagram: Diagram): void {
  associateBuiltinModels(diagram);
  diagram.associateTypeScript(FIXTURES_FILE, FIXTURES_TS);
}
