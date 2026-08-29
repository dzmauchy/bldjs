import javaLangXml from "../../resources/models/java-lang.xml?raw";
import javaUtilXml from "../../resources/models/java-util.xml?raw";
import flowXml from "../../resources/models/flow.xml?raw";
import controlSystemsXml from "../../resources/models/control-systems.xml?raw";
import type { Diagram } from "./diagram";

export const JAVA_LANG_XML = javaLangXml;
export const JAVA_UTIL_XML = javaUtilXml;
export const FLOW_XML = flowXml;
export const CONTROL_SYSTEMS_XML = controlSystemsXml;

export const BUILTIN_MODELS: ReadonlyArray<readonly [string, string]> = [
  ["java-lang.xml", JAVA_LANG_XML],
  ["java-util.xml", JAVA_UTIL_XML],
  ["flow.xml", FLOW_XML],
  ["control-systems.xml", CONTROL_SYSTEMS_XML],
];

export function associateBuiltinModels(diagram: Diagram): void {
  for (const [name, xml] of BUILTIN_MODELS) {
    diagram.associateXml(name, xml);
  }
}
