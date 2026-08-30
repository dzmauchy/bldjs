import type { SolutionView } from "./view";

export interface SolutionAssembly {
  wasm: Uint8Array;
  text: string;
}

/** Builds a target assembly from a connected SolutionView. */
export interface SolutionBuilder {
  build(view: SolutionView): Promise<SolutionAssembly>;
}
