import typesXml from "../../resources/models/types.xml?raw";
import flowXml from "../../resources/models/flow.xml?raw";
import controlSystemsXml from "../../resources/models/control-systems.xml?raw";
import type { Diagram } from "./diagram";

export const TYPES_XML = typesXml;
export const FLOW_XML = flowXml;
export const CONTROL_SYSTEMS_XML = controlSystemsXml;

export const BUILTIN_MODELS: ReadonlyArray<readonly [string, string]> = [
  ["types.xml", TYPES_XML],
  ["flow.xml", FLOW_XML],
  ["control-systems.xml", CONTROL_SYSTEMS_XML],
];

export function associateBuiltinModels(diagram: Diagram): void {
  for (const [name, xml] of BUILTIN_MODELS) {
    diagram.associateXml(name, xml);
  }
}
