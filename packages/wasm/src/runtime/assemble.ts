import { associateBuiltinModels } from "@bld/xml";
import { Diagram } from "@bld/xml";
import { firstTimerId, type SolutionView, type SolutionViewConnector } from "@bld/xml";
import { linearSolutionView, WasmSolutionBuilder } from "../solution/wasm";
import { blockSignature, blockTypeWat } from "./signatures";

import { type Stage } from "@bld/xml";

export type { BlockScriptId } from "../binaryen";
export { blockTypeWat } from "./signatures";
export type { SolutionView } from "@bld/xml";

export interface AssembleOptions {
  stages?: readonly Stage[];
  delayMs: number;
  view?: SolutionView;
  timerId?: number;
  sharedMemory?: boolean;
  emitText?: boolean;
}

export interface AssembledModule {
  wasm: Uint8Array;
  text: string;
  connectors: readonly SolutionViewConnector[];
}

/** Types whose names are referenced from XML block composition (`$fn_timer`, …). */
export function runtimeTypeWat(): string {
  const diagram = new Diagram("ws", "Workspace");
  associateBuiltinModels(diagram);
  return diagram
    .catalog()
    .blocks()
    .map((block) => blockTypeWat(blockSignature(block)))
    .join("\n");
}

export async function assembleModule(options: AssembleOptions): Promise<AssembledModule> {
  const view = options.view ?? linearSolutionView(options.stages ?? []);
  const builder = new WasmSolutionBuilder();
  return builder.build(view, {
    delayMs: options.delayMs,
    timerId: options.timerId ?? firstTimerId(view),
    sharedMemory: options.sharedMemory,
    emitText: options.emitText,
  });
}

export async function assembleWasm(options: AssembleOptions): Promise<Uint8Array> {
  return (await assembleModule(options)).wasm;
}

/** @deprecated Prefer {@link assembleModule}; emitText of the assembled module. */
export async function assembleWat(options: AssembleOptions): Promise<string> {
  return (await assembleModule(options)).text;
}
