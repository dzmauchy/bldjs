import { assembleGenerator } from "../compile";
import type { GeneratorPlan, NodeSpec, ScopeSeries } from "@bld/xml/blocks/cs/types";
import type { Link } from "@bld/xml/blocks/diagram";
import { hzFromDelta, intervalMs } from "@bld/xml/flow";
import type { Runner, RunnerSession, RunnerStartOptions } from "@bld/xml/runner";
import { connectorKey, solutionViewFrom } from "@bld/xml/solution/view";
import { plannedGenerators, topologyKey } from "@bld/xml/topology";
import { type GeneratorHandle, startGenerator } from "./generator";

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
  generatorId: number;
}

export class DiagramRunCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "DiagramRunCancelled";
  }
}

export const EMPTY_RUN_MESSAGE = "Wire a Scope or GPIO into a generator, then Run.";

/** Live generator session: handles, scope bindings, and connector Hertz. */
export class RunningDiagram implements RunnerSession {
  readonly generators = new Map<number, GeneratorHandle>();
  readonly scopeChannels = new Map<number, ScopeChannelBinding[]>();
  readonly linkHz = new Map<string, number>();
  readonly topology: string;
  prodWasm: Uint8Array | null = null;
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
    this.scopeChannels.clear();
    this.linkHz.clear();
    this.#flowPrev.clear();
    this.#flowSampleAt = 0;
  }

  isScopeLive(id: number): boolean {
    return (this.scopeChannels.get(id)?.length ?? 0) > 0;
  }

  connectorHz(link: { fromBlock: number; fromOut: string; toBlock: number; toIn: string }): number {
    return this.linkHz.get(connectorKey(link)) ?? 0;
  }

  connectorHzForKey(key: string): number {
    return this.linkHz.get(key) ?? 0;
  }

  snapshotScope(id: number): ScopeSeries[] {
    const channels = this.scopeChannels.get(id);
    if (!channels?.length) {
      return [];
    }
    return channels.map((channel) => ({
      label: channel.label,
      samples: this.generators.get(channel.generatorId)?.snapshot(channel.ring) ?? [],
    }));
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

  gpioLevel(pin: number): number {
    for (const handle of this.generators.values()) {
      return handle.gpioLevel(pin);
    }
    return 0;
  }

  setGpio(pin: number, level: number): void {
    for (const handle of this.generators.values()) {
      handle.setGpio(pin, level);
    }
  }

  arm(plans: GeneratorPlan[], nodes: NodeSpec[], links: Link[]): void {
    const view = solutionViewFrom(nodes, links);
    for (const plan of plans) {
      const nominalHz = 1000 / intervalMs(plan.delayMs);
      for (const link of view.subgraphFromGenerator(plan.generatorId).connectors) {
        this.linkHz.set(connectorKey(link), nominalHz);
      }
      plan.channels.forEach((channel, index) => {
        if (nodes.find((node) => node.id === channel.scopeId)?.defId !== "scope") {
          return;
        }
        const series = this.scopeChannels.get(channel.scopeId) ?? [];
        series.push({ label: channel.label, ring: index, generatorId: plan.generatorId });
        this.scopeChannels.set(channel.scopeId, series);
      });
    }
  }
}

/**
 * Assemble WASM, start generator workers, and own runtime telemetry.
 * AppState stays responsible for UI flags (`starting` / `running` / `runError`).
 */
export class DiagramRunner implements Runner {
  #op = 0;
  #current: RunningDiagram | null = null;
  lastProdWasm: Uint8Array | null = null;

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
    options: RunnerStartOptions = {},
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
      const { wasm, prodWasm, connectors } = await assembleGenerator(plan, nodes, links);
      session.prodWasm = prodWasm;
      this.lastProdWasm = prodWasm;
      const handle = await startGenerator({
        wasm,
        delayMs: plan.delayMs,
        connectors,
        gpio: options.gpio,
      });
      if (op !== this.#op) {
        handle.stop();
        throw new DiagramRunCancelled();
      }
      session.generators.set(plan.generatorId, handle);
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
