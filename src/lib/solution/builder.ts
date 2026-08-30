import type { SolutionView, SolutionViewConnector } from "./view";

export interface SolutionAssembly {
  wasm: Uint8Array;
  text: string;
  /** Consumer wires in the assembled subgraph, in tap-counter order. */
  connectors: readonly SolutionViewConnector[];
}

/** Builds a target assembly from a connected SolutionView. */
export interface SolutionBuilder {
  build(view: SolutionView): Promise<SolutionAssembly>;
}
