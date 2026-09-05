import type { SolutionView, SolutionViewConnector } from "./view";

export interface SolutionAssembly {
  /** Browser/dev module (`wasm-gc`) with Math/Date/`setInterval` imports. */
  wasm: Uint8Array;
  /** MCU/prod module (linear `wasm`) with `"env"` RTOS/WebUSB imports. */
  prodWasm: Uint8Array;
  text: string;
  /** Consumer wires in the assembled subgraph, in runner frequency-counter order. */
  connectors: readonly SolutionViewConnector[];
}

export type WasmTarget = "wasm-gc" | "wasm";

export interface TargetAssembly {
  target: WasmTarget;
  wasm: Uint8Array;
  text: string;
  connectors: readonly SolutionViewConnector[];
}

/** Builds a target assembly from a connected SolutionView. */
export interface SolutionBuilder {
  build(view: SolutionView, options?: unknown): Promise<SolutionAssembly>;
}

/** Abstract base solution builder for a specific target. */
export abstract class AbstractSolutionBuilder {
  abstract readonly target: WasmTarget;
  abstract build(view: SolutionView, options?: unknown): Promise<TargetAssembly>;
}
