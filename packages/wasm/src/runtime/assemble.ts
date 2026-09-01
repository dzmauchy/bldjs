import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Diagram } from "@bld/xml/blocks/diagram";
import { type SolutionView, type SolutionViewConnector } from "@bld/xml/solution/view";
import { linearSolutionView, WasmSolutionBuilder } from "../solution/wasm";
import { blockSignature, blockTypeWat } from "./signatures";

export { blockTypeWat } from "./signatures";
export type { SolutionView } from "@bld/xml/solution/view";

export interface AssembleOptions {
  generator?: string;
  /** Last entry is treated as the generator when `generator` is omitted. */
  stages?: readonly string[];
  delayMs: number;
  view?: SolutionView;
  generatorId?: number;
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
  const generator = options.generator ?? options.stages?.at(-1) ?? "timer";
  const view = options.view ?? linearSolutionView(generator);
  const builder = new WasmSolutionBuilder();
  return builder.build(view, {
    delayMs: options.delayMs,
    generatorId: options.generatorId ?? options.timerId ?? view.firstGeneratorId(),
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
