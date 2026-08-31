import typesXml from "../resources/models/types.xml?raw";
import controlSystemsXml from "../resources/models/control-systems.xml?raw";
import fixturesXml from "./fixtures.xml?raw";
import type { Diagram } from "./diagram";

export const TYPES_XML = typesXml;
export const CONTROL_SYSTEMS_XML = controlSystemsXml;
export const FIXTURES_XML = fixturesXml;

export const BUILTIN_MODELS: ReadonlyArray<readonly [string, string]> = [
  ["types.xml", TYPES_XML],
  ["control-systems.xml", CONTROL_SYSTEMS_XML],
];

export function associateBuiltinModels(diagram: Diagram): void {
  for (const [name, xml] of BUILTIN_MODELS) {
    diagram.associateXml(name, xml);
  }
}

/** Extra blocks used only by unit tests (array, flow, type constructors). */
export function associateFixtureModels(diagram: Diagram): void {
  associateBuiltinModels(diagram);
  diagram.associateXml("fixtures.xml", FIXTURES_XML);
}
