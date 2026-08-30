import { assembleGenerator, type GeneratorPlan, type Link, type NodeSpec, type ScopeSeries } from "../blocks";
import { plannedGenerators, topologyKey } from "../topology";
import { type GeneratorHandle, startGenerator } from "./generator";
import { hzFromDelta, intervalMs } from "./flow";
import { connectorKey, solutionViewFrom, subgraphFromTimer } from "../solution/view";

export function yieldForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export interface ScopeChannelBinding {
  label: string;
  ring: number;
}

export class DiagramRunCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "DiagramRunCancelled";
  }
}

export const EMPTY_RUN_MESSAGE = "Wire an Oscilloscope through to a Timer, then Run.";

/** Live generator session: handles, scope bindings, and connector Hertz. */
export class RunningDiagram {
  readonly generators = new Map<number, GeneratorHandle>();
  readonly scopeToTimer = new Map<number, number>();
  readonly scopeChannels = new Map<number, ScopeChannelBinding[]>();
  readonly linkHz = new Map<string, number>();
  readonly topology: string;
  #flowPrev = new Map<GeneratorHandle, number[]>();
  #flowSampleAt = 0;
  #disposed = false;

  constructor(topology: string) {
    this.topology = topology;
  }

  stop(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const handle of this.generators.values()) {
      handle.stop();
    }
    this.generators.clear();
    this.scopeToTimer.clear();
    this.scopeChannels.clear();
    this.linkHz.clear();
    this.#flowPrev.clear();
    this.#flowSampleAt = 0;
  }

  isScopeLive(id: number): boolean {
    return this.scopeToTimer.has(id);
  }

  connectorHz(link: { fromBlock: number; fromOut: string; toBlock: number; toIn: string }): number {
    return this.linkHz.get(connectorKey(link)) ?? 0;
  }

  connectorHzForKey(key: string): number {
    return this.linkHz.get(key) ?? 0;
  }

  async snapshotScope(id: number): Promise<ScopeSeries[]> {
    const timerId = this.scopeToTimer.get(id);
    const channels = this.scopeChannels.get(id);
    if (timerId === undefined || !channels?.length) {
      return [];
    }
    const handle = this.generators.get(timerId);
    if (!handle) {
      return [];
    }
    return Promise.all(
      channels.map(async (channel) => ({
        label: channel.label,
        samples: await handle.snapshot(channel.ring),
      })),
    );
  }

  sampleFlowRates(now = performance.now()): void {
    if (this.generators.size === 0) {
      return;
    }
    if (this.#flowSampleAt === 0) {
      this.#flowSampleAt = now;
      for (const handle of this.generators.values()) {
        this.#flowPrev.set(handle, handle.readFlowCounts());
      }
      return;
    }
    const dt = now - this.#flowSampleAt;
    if (dt <= 0) {
      return;
    }
    this.#flowSampleAt = now;
    for (const handle of this.generators.values()) {
      const counts = handle.readFlowCounts();
      const prev = this.#flowPrev.get(handle) ?? [];
      handle.connectors.forEach((link, index) => {
        const hz = hzFromDelta(prev[index] ?? 0, counts[index] ?? 0, dt);
        if (hz > 0) {
          this.linkHz.set(connectorKey(link), hz);
        }
      });
      this.#flowPrev.set(handle, counts);
    }
  }

  arm(plans: GeneratorPlan[], nodes: NodeSpec[], links: Link[]): void {
    const view = solutionViewFrom(nodes, links);
    for (const plan of plans) {
      const nominalHz = 1000 / intervalMs(plan.delayMs);
      for (const link of subgraphFromTimer(view, plan.timerId).connectors) {
        this.linkHz.set(connectorKey(link), nominalHz);
      }
      plan.channels.forEach((channel, index) => {
        this.scopeToTimer.set(channel.scopeId, plan.timerId);
        const series = this.scopeChannels.get(channel.scopeId) ?? [];
        series.push({ label: channel.label, ring: index });
        this.scopeChannels.set(channel.scopeId, series);
      });
    }
  }
}

/**
 * Assemble WASM, start generator workers, and own runtime telemetry.
 * AppState stays responsible for UI flags (`starting` / `running` / `runError`).
 */
export class DiagramRunner {
  #op = 0;
  #current: RunningDiagram | null = null;

  get current(): RunningDiagram | null {
    return this.#current;
  }

  stop(): void {
    this.#op += 1;
    this.#current?.stop();
    this.#current = null;
  }

  async start(
    nodes: NodeSpec[],
    links: Link[],
    options: {
      yieldForPaint?: () => Promise<void>;
      onArmed?: (session: RunningDiagram) => void;
    } = {},
  ): Promise<RunningDiagram> {
    const topology = topologyKey(nodes, links);
    const plans = plannedGenerators(nodes, links);
    if (plans.length === 0) {
      throw new Error(EMPTY_RUN_MESSAGE);
    }
    this.stop();
    const session = new RunningDiagram(topology);
    session.arm(plans, nodes, links);
    this.#current = session;
    const op = this.#op;
    options.onArmed?.(session);
    await (options.yieldForPaint ?? yieldForPaint)();
    if (op !== this.#op) {
      throw new DiagramRunCancelled();
    }
    for (const plan of plans) {
      const { wasm, connectors } = await assembleGenerator(plan, nodes, links);
      const handle = await startGenerator({ wasm, delayMs: plan.delayMs, connectors });
      if (op !== this.#op) {
        handle.stop();
        throw new DiagramRunCancelled();
      }
      session.generators.set(plan.timerId, handle);
      const nominalHz = 1000 / intervalMs(plan.delayMs);
      for (const link of connectors) {
        session.linkHz.set(connectorKey(link), nominalHz);
      }
    }
    if (op !== this.#op) {
      throw new DiagramRunCancelled();
    }
    return session;
  }
}
