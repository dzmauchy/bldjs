import type { Link } from "./blocks/diagram";
import type { NodeSpec, ScopeSeries } from "./blocks/cs/types";

/** Live generator session owned by a {@link Runner}. */
export interface RunnerSession {
  readonly topology: string;
  stop(): void;
  isScopeLive(id: number): boolean;
  connectorHz(link: { fromBlock: number; fromOut: string; toBlock: number; toIn: string }): number;
  snapshotScope(id: number): ScopeSeries[];
}

export interface RunnerStartOptions {
  yieldForPaint?: () => Promise<void>;
  onArmed?: (session: RunnerSession) => void;
}

/**
 * Start and stop a compiled diagram. WASM (or another backend) implements this.
 */
export interface Runner {
  readonly current: RunnerSession | null;
  stop(): void;
  start(
    nodes: NodeSpec[],
    links: Link[],
    options?: RunnerStartOptions,
  ): Promise<RunnerSession>;
}
