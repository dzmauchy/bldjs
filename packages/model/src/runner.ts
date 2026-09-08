import type { Link } from "./blocks/diagram";
import type { NodeSpec, ScopeSeries } from "./blocks/cs/types";

/** Live generator session owned by a {@link Runner}. */
export interface RunnerSession {
  readonly topology: string;
  stop(): void;
  isScopeLive(id: number): boolean;
  connectorHz(link: { fromBlock: number; fromOut: string; toBlock: number; toIn: string }): number;
  snapshotScope(id: number): ScopeSeries[];
  gpioLevel?(pin: number): number;
  setGpio?(pin: number, level: number): void;
  tick?(id: number): void;
}

export interface RunnerStartOptions {
  yieldForPaint?: () => Promise<void>;
  onArmed?: (session: RunnerSession) => void;
  /** Initial simulated GPIO levels keyed by pin number (dev / browser). */
  gpio?: ReadonlyMap<number, number>;
  /** Full diagram TypeScript payload. When omitted, the runner serializes nodes/links. */
  source?: string;
}

/**
 * Start and stop a compiled diagram TypeScript runtime.
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
