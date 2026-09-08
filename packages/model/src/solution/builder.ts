import type { SolutionView, SolutionViewConnector } from "./view";

export interface SolutionAssembly {
  /** Compiled JavaScript for the diagram worker. */
  js: string;
  /** Generated TypeScript diagram payload. */
  text: string;
  /** Consumer wires in the assembled subgraph, in runner frequency-counter order. */
  connectors: readonly SolutionViewConnector[];
}

export interface TargetAssembly {
  js: string;
  text: string;
  connectors: readonly SolutionViewConnector[];
}

/** Builds a target assembly from a connected SolutionView. */
export interface SolutionBuilder {
  build(view: SolutionView, options?: unknown): Promise<SolutionAssembly>;
}

/** Abstract base solution builder. */
export abstract class AbstractSolutionBuilder {
  abstract build(view: SolutionView, options?: unknown): Promise<TargetAssembly>;
}
