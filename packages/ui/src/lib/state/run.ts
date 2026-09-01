import type { Catalog } from "@bld/xml/blocks/catalog";
import type { Link } from "@bld/xml/blocks/diagram";
import { loadDiagramSolution } from "@bld/xml/diagram/compile";
import { plannedGenerators, topologyKey } from "@bld/xml/topology";
import { DiagramRunCancelled, DiagramRunner, EMPTY_RUN_MESSAGE } from "@bld/wasm/runtime/diagram-runner";
import { preloadAssembler } from "@bld/wasm/solution/wasm";
import { NONE_ID } from "../model";

/** Canvas + catalog surface the run session needs. Lives in `run.ts` so UI chrome can stay off this graph. */
export interface RunHost {
  notify(): void;
  catalog: Catalog;
  links: Link[];
  runNodes(): Array<{ id: number; defId: string; periodMs?: number }>;
  toDiagramXml(): string;
  get scopeOpen(): number;
  set scopeOpen(id: number);
}

/** WASM runner lifecycle. UI reads `running` / `error`; canvas samples Hertz from here. */
export class RunSession {
  #host: RunHost;
  #runner = new DiagramRunner();
  #starting = false;
  #running = false;
  #error: string | null = null;

  constructor(host: RunHost) {
    this.#host = host;
  }

  get starting(): boolean {
    return this.#starting;
  }

  set starting(value: boolean) {
    if (this.#starting === value) {
      return;
    }
    this.#starting = value;
    this.#host.notify();
  }

  get running(): boolean {
    return this.#running;
  }

  set running(value: boolean) {
    if (this.#running === value) {
      return;
    }
    this.#running = value;
    this.#host.notify();
  }

  get error(): string | null {
    return this.#error;
  }

  set error(value: string | null) {
    if (this.#error === value) {
      return;
    }
    this.#error = value;
    this.#host.notify();
  }

  busy(): boolean {
    return this.#running || this.#starting;
  }

  topologyKey(): string {
    return topologyKey(this.#host.runNodes(), this.#host.links);
  }

  planned() {
    return plannedGenerators(this.#host.runNodes(), this.#host.links);
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
    if (!this.#running) {
      return;
    }
    this.#runner.current?.sampleFlowRates(now);
  }

  stop(): void {
    this.#runner.stop();
    const changed = this.#starting || this.#running;
    this.#starting = false;
    this.#running = false;
    if (this.#host.scopeOpen !== NONE_ID && !this.isScopeLive(this.#host.scopeOpen)) {
      this.#host.scopeOpen = NONE_ID;
    } else if (changed) {
      this.#host.notify();
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
    this.starting = true;
    try {
      const solution = loadDiagramSolution(this.#host.toDiagramXml(), this.#host.catalog);
      await this.#runner.start(solution.nodes, solution.links, {
        onArmed: () => this.#host.notify(),
      });
      if (!this.#runner.current) {
        return;
      }
      this.#error = null;
      this.#starting = false;
      this.#running = true;
      this.#host.notify();
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
