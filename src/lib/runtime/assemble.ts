import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { firstTimerId, type SolutionView, type SolutionViewConnector } from "../solution/view";
import { linearSolutionView, WasmSolutionBuilder } from "../solution/wasm";
import { asBlockType, asSignature, blockSignature } from "./signatures";

export type Stage = "sin" | "cos" | "quantizer";

export type { BlockScriptId } from "../../resources/assemblyscript";
export { asBlockType, blockTypeWat } from "./signatures";
export type { SolutionView } from "../solution/view";

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

/** Catalog block headers using AssemblyScript `c<T>` aliases. */
export function runtimeTypeAs(): string {
  const diagram = new Diagram("ws", "Workspace");
  associateBuiltinModels(diagram);
  return diagram
    .catalog()
    .blocks()
    .map((block) => asBlockType(blockSignature(block)))
    .join("\n");
}

/** @deprecated Prefer {@link runtimeTypeAs}. */
export function runtimeTypeWat(): string {
  return runtimeTypeAs();
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

export { asSignature };
