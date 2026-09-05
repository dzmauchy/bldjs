import type { Catalog } from "@bld/xml/blocks/catalog";
import type { Link } from "@bld/xml/blocks/diagram";
import { loadDiagramSolution } from "@bld/xml/diagram/compile";
import { plannedGenerators, topologyKey } from "@bld/xml/topology";
import { DiagramRunCancelled, DiagramRunner, EMPTY_RUN_MESSAGE } from "@bld/wasm/runtime/diagram-runner";
import { preloadAssembler } from "@bld/wasm/solution/wasm";
import { HostedState } from "../observable";
import { NONE_ID } from "../model";

/** Canvas + catalog surface the run session needs. Lives in `run.ts` so UI chrome can stay off this graph. */
export interface RunHost {
  notify(): void;
  catalog: Catalog;
  links: Link[];
  runNodes(): Array<{
    id: number;
    defId: string;
    periodMs?: number;
    pin?: number;
    zeta?: number;
    omega?: number;
    value?: number;
    count?: number;
    def?: number;
    windowS?: number;
    meterMs?: number;
  }>;
  toDiagramXml(): string;
  get scopeOpen(): number;
  set scopeOpen(id: number);
  get inputsOpen(): number;
  set inputsOpen(id: number);
  gpioSnapshot?(): ReadonlyMap<number, number>;
}

/** WASM runner lifecycle. UI reads `running` / `error`; canvas samples Hertz from here. */
export class RunSession extends HostedState<RunHost> {
  #runner = new DiagramRunner();
  declare starting: boolean;
  declare running: boolean;
  declare error: string | null;

  constructor(host: RunHost) {
    super(host);
    this.defineFields({ starting: false, running: false, error: null });
  }

  busy(): boolean {
    return this.running || this.starting;
  }

  topologyKey(): string {
    return topologyKey(this.host.runNodes(), this.host.links);
  }

  planned() {
    return plannedGenerators(this.host.runNodes(), this.host.links);
  }

  canStart(): boolean {
    return this.planned().length > 0;
  }

  isScopeLive(id: number): boolean {
    return this.busy() && (this.#runner.current?.isScopeLive(id) ?? false);
  }

  snapshotScope(id: number) {
    return this.#runner.current?.snapshotScope(id) ?? [];
  }

  connectorHz(link: { fromBlock: number; fromOut: string; toBlock: number; toIn: string }): number {
    return this.#runner.current?.connectorHz(link) ?? 0;
  }

  connectorHzForKey(key: string): number {
    return this.#runner.current?.connectorHzForKey(key) ?? 0;
  }

  sampleFlowRates(now = performance.now()): void {
    if (!this.running) {
      return;
    }
    this.#runner.current?.sampleFlowRates(now);
  }

  gpioLevel(pin: number): number {
    return this.#runner.current?.gpioLevel(pin) ?? 0;
  }

  setGpio(pin: number, level: number): void {
    this.#runner.current?.setGpio(pin, level);
  }

  tick(id: number): void {
    this.#runner.current?.tick(id);
  }

  prodWasm(): Uint8Array | null {
    return this.#runner.current?.prodWasm ?? this.#runner.lastProdWasm;
  }

  stop(): void {
    this.#runner.stop();
    const changed = this.starting || this.running;
    this.starting = false;
    this.running = false;
    if (this.host.scopeOpen !== NONE_ID && !this.isScopeLive(this.host.scopeOpen)) {
      this.host.scopeOpen = NONE_ID;
    } else if (changed) {
      this.host.notify();
    }
  }

  async start(): Promise<void> {
    if (this.busy()) {
      return;
    }
    if (this.planned().length === 0) {
      this.error = EMPTY_RUN_MESSAGE;
      return;
    }
    this.stop();
    if (this.host.inputsOpen !== NONE_ID) {
      this.host.inputsOpen = NONE_ID;
    }
    this.starting = true;
    try {
      const solution = loadDiagramSolution(this.host.toDiagramXml(), this.host.catalog);
      await this.#runner.start(solution.nodes, solution.links, {
        onArmed: () => this.host.notify(),
        gpio: this.host.gpioSnapshot?.(),
      });
      if (!this.#runner.current) {
        return;
      }
      this.error = null;
      this.starting = false;
      this.running = true;
    } catch (error) {
      if (error instanceof DiagramRunCancelled) {
        return;
      }
      this.stop();
      this.error = error instanceof Error ? error.message : "Run failed";
    }
  }

  invalidate(): void {
    if (!this.busy() && !this.#runner.current) {
      return;
    }
    if (this.topologyKey() === this.#runner.current?.topology) {
      return;
    }
    this.stop();
  }

  maybePreload(): void {
    if (this.canStart()) {
      preloadAssembler();
    }
  }
}

export { EMPTY_RUN_MESSAGE };
