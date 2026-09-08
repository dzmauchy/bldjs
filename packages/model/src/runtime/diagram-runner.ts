import type { GeneratorPlan, NodeSpec, ScopeSeries } from "../blocks/cs/types";
import { isEventDrivenGenerator, meterMsFrom, sampleCap, windowSecondsFrom } from "../blocks/cs/ids";
import { WindowBuf } from "../blocks/cs/samples";
import type { Link } from "../blocks/diagram";
import { intervalMs } from "../flow";
import type { Runner, RunnerSession, RunnerStartOptions } from "../runner";
import { connectorKey, solutionViewFrom } from "../solution/view";
import { plannedGenerators, topologyKey } from "../topology";
import { serializeCanvas } from "../diagram/json";
import { compileTypeScriptAsync, preloadTsc } from "../tsc/emit";
import { canUseDiagramWorker } from "../isolation";
import { createRuntimeHost, runCompiledDiagram, type RuntimeHost } from "./host";

export function yieldForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export class DiagramRunCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "DiagramRunCancelled";
  }
}

export const EMPTY_RUN_MESSAGE = "Wire a Scope or GPIO into a generator, then Run.";

interface ScopeMeter {
  buffers: WindowBuf[];
  labels: string[];
}

export function preloadAssembler(): void {
  void preloadTsc();
}

/** Live compiled-diagram session. */
export class RunningDiagram implements RunnerSession {
  readonly topology: string;
  readonly linkHz = new Map<string, number>();
  readonly scopeChannels = new Map<number, string[]>();
  readonly connectors: Link[];
  #meters = new Map<number, ScopeMeter>();
  #host: RuntimeHost | null = null;
  #worker: Worker | null = null;
  #disposed = false;
  #gpio = new Map<number, number>();

  constructor(topology: string, connectors: Link[]) {
    this.topology = topology;
    this.connectors = connectors;
  }

  stop(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#host?.stop();
    this.#host = null;
    this.#worker?.postMessage({ type: "stop" });
    this.#worker?.terminate();
    this.#worker = null;
    this.scopeChannels.clear();
    this.linkHz.clear();
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
    const meter = this.#meters.get(id);
    if (!meter) {
      return [];
    }
    return meter.labels.map((label, index) => ({
      label,
      samples: meter.buffers[index]?.snapshot() ?? [],
    }));
  }

  sampleFlowRates(now = typeof performance !== "undefined" ? performance.now() : Date.now()): void {
    const freqs = this.#host?.frequencies(now);
    if (!freqs) {
      return;
    }
    this.connectors.forEach((link, index) => {
      this.linkHz.set(connectorKey(link), freqs[index] ?? 0);
    });
  }

  gpioLevel(pin: number): number {
    return this.#gpio.get(pin) ?? this.#host?.pinRead(pin) ?? 0;
  }

  setGpio(pin: number, level: number): void {
    this.#gpio.set(pin, level);
    this.#host?.setGpio(pin, level);
    this.#worker?.postMessage({ type: "gpio", pin, level });
  }

  tick(_id: number): void {
    // GPIO In samples on pin edges via setGpio.
  }

  arm(plans: GeneratorPlan[], nodes: NodeSpec[], links: Link[]): void {
    const view = solutionViewFrom(nodes, links);
    for (const plan of plans) {
      if (!isEventDrivenGenerator(plan.defId) && plan.defId !== "constant") {
        const nominalHz = 1000 / intervalMs(plan.delayMs);
        for (const link of view.subgraphFromGenerator(plan.generatorId).connectors) {
          this.linkHz.set(connectorKey(link), nominalHz);
        }
      }
      plan.channels.forEach((channel) => {
        if (nodes.find((node) => node.id === channel.scopeId)?.defId !== "scope") {
          return;
        }
        const series = this.scopeChannels.get(channel.scopeId) ?? [];
        series.push(channel.label);
        this.scopeChannels.set(channel.scopeId, series);
      });
    }
    this.#startMeters(nodes);
  }

  handleMessage(message: { type: string; id?: number; values?: number[]; windowS?: number; meterMs?: number; frequencies?: number[]; pin?: number; level?: number }): void {
    if (message.type === "scope" && message.id !== undefined && message.values) {
      let meter = this.#meters.get(message.id);
      if (!meter) {
        const n = windowSecondsFrom(message.windowS);
        const m = meterMsFrom(message.meterMs);
        const cap = sampleCap(n, m);
        const labels = this.scopeChannels.get(message.id) ?? message.values.map((_, index) => `ch${index}`);
        meter = { labels, buffers: labels.map(() => new WindowBuf(cap)) };
        this.#meters.set(message.id, meter);
      }
      message.values.forEach((value, index) => {
        meter.buffers[index]?.push(value);
      });
      return;
    }
    if (message.type === "frequency" && message.frequencies) {
      this.connectors.forEach((link, index) => {
        this.linkHz.set(connectorKey(link), message.frequencies![index] ?? 0);
      });
      return;
    }
    if (message.type === "gpio" && message.pin !== undefined && message.level !== undefined) {
      this.#gpio.set(message.pin, message.level);
    }
  }

  attachHost(host: RuntimeHost): void {
    this.#host = host;
  }

  attachWorker(worker: Worker): void {
    this.#worker = worker;
  }

  #startMeters(nodes: NodeSpec[]): void {
    for (const [scopeId, labels] of this.scopeChannels) {
      const spec = nodes.find((node) => node.id === scopeId);
      const n = windowSecondsFrom(spec?.windowS);
      const m = meterMsFrom(spec?.meterMs);
      const buffers = labels.map(() => new WindowBuf(sampleCap(n, m)));
      this.#meters.set(scopeId, { buffers, labels });
    }
  }
}

export interface DiagramStartOptions extends RunnerStartOptions {
  source?: string;
}

/**
 * Compile generated diagram TypeScript and run it in a worker (or this thread in tests).
 */
export class DiagramRunner implements Runner {
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

  async start(nodes: NodeSpec[], links: Link[], options: DiagramStartOptions = {}): Promise<RunningDiagram> {
    const topology = topologyKey(nodes, links);
    const plans = plannedGenerators(nodes, links);
    if (plans.length === 0) {
      throw new Error(EMPTY_RUN_MESSAGE);
    }
    this.stop();
    const session = new RunningDiagram(topology, links);
    session.arm(plans, nodes, links);
    this.#current = session;
    const op = this.#op;
    options.onArmed?.(session);
    await (options.yieldForPaint ?? yieldForPaint)();
    if (op !== this.#op) {
      throw new DiagramRunCancelled();
    }
    const source =
      options.source ??
      serializeCanvas({
        id: "run",
        name: "Run",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        blocks: nodes.map((node) => ({ id: node.id, defId: node.defId, x: 0, y: 0 })),
        links,
        extras: extrasFromNodes(nodes),
      });
    const js = await compileTypeScriptAsync(source);
    if (op !== this.#op) {
      throw new DiagramRunCancelled();
    }
    const gpio = options.gpio ?? new Map<number, number>();
    const delayMs = plans.find((plan) => !isEventDrivenGenerator(plan.defId))?.delayMs ?? 10;
    const useWorker =
      typeof document !== "undefined" && import.meta.env?.MODE !== "test" && canUseDiagramWorker();
    if (useWorker) {
      const worker = new Worker(new URL("./diagram.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent) => {
        session.handleMessage(event.data);
      };
      session.attachWorker(worker);
      worker.postMessage({
        type: "start",
        js,
        gpio: [...gpio.entries()],
        connectorCount: links.length,
        delayMs,
      });
    } else {
      const host = createRuntimeHost({
        connectorCount: links.length,
        delayMs,
        gpio,
        post(message) {
          session.handleMessage(message);
        },
      });
      session.attachHost(host);
      runCompiledDiagram(js, host);
    }
    if (op !== this.#op) {
      session.stop();
      throw new DiagramRunCancelled();
    }
    return session;
  }
}

function extrasFromNodes(nodes: NodeSpec[]): Map<number, import("../diagram/types").BlockExtras> {
  const extras = new Map<number, import("../diagram/types").BlockExtras>();
  for (const node of nodes) {
    const parameters: import("../diagram/types").ParameterValue[] = [];
    if (node.periodMs !== undefined) {
      parameters.push({ kind: "integer-range-parameter", name: "period", value: String(node.periodMs) });
    }
    if (node.pin !== undefined) {
      parameters.push({ kind: "integer-range-parameter", name: "pin", value: String(node.pin) });
    }
    if (node.zeta !== undefined) {
      parameters.push({ kind: "double-range-parameter", name: "ζ", value: String(node.zeta) });
    }
    if (node.omega !== undefined) {
      parameters.push({ kind: "double-range-parameter", name: "ω", value: String(node.omega) });
    }
    if (node.value !== undefined) {
      parameters.push({ kind: "double-range-parameter", name: "value", value: String(node.value) });
    }
    if (node.count !== undefined) {
      parameters.push({ kind: "integer-range-parameter", name: "n", value: String(node.count) });
    }
    if (node.def !== undefined) {
      parameters.push({ kind: "double-range-parameter", name: "def", value: String(node.def) });
    }
    if (node.windowS !== undefined) {
      parameters.push({ kind: "integer-range-parameter", name: "n", value: String(node.windowS) });
    }
    if (node.meterMs !== undefined) {
      parameters.push({ kind: "integer-range-parameter", name: "m", value: String(node.meterMs) });
    }
    extras.set(node.id, { parameters });
  }
  return extras;
}
