import type { Link } from "./diagram";
import { catalogPortName, portSlotIndex } from "./ports";

/** Default generator quantization period (`integer-range-parameter` `period`). */
export const DEFAULT_PERIOD_MS = 10;
/** @deprecated Use {@link DEFAULT_PERIOD_MS}. */
export const QUANTIZER_DELAY_MS = DEFAULT_PERIOD_MS;

export const PERIOD_PARAM = "period";

export const GENERATOR_IDS = new Set(["timer", "sin", "cos", "random"]);

export function isGeneratorId(defId: string): boolean {
  return GENERATOR_IDS.has(defId);
}

export function periodMsFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_PERIOD_MS : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PERIOD_MS;
  }
  return Math.max(1, Math.trunc(parsed));
}

/** Shared sample ring capacity for CS scope buffers and the WASM runner. */
export const SAMPLE_CAP = 480;

/** Language-agnostic consumer `c1<T>` / Java `Consumer<T>`. */
export type Func<T> = (value: T) => void;
/** Java `DoubleConsumer` — catalog `c<f64>`. */
export type DoubleConsumer = Func<number>;
export type F64Func = DoubleConsumer;
/** @deprecated Push model uses {@link DoubleConsumer} on every port. */
export type DoubleSource = DoubleConsumer;
export type F64Source = DoubleConsumer;
/** @deprecated Same as {@link DoubleConsumer}. */
export type Nested = DoubleConsumer;

/**
 * Pure push. Compact display writes c1 as c:
 *
 *   timer(c) / sin(c) / cos(c) / random(c)  : c<f64> → void
 *   scope()                                   : c<f64>[]            (vector of plot sinks)
 *
 * Composition: sin(plot[0])
 *
 * Each generator uses an internal quantizer whose period (ms) comes from the
 * catalog `period` range input (default 10). Binaryen blocks repeat the XML
 * signature plus runtime `$ctx i32`.
 */

function parkNanos(periodNs: number): void {
  if (periodNs <= 0) {
    return;
  }
}

/**
 * Shared generator: sample from time, push into a consumer, then apply the
 * internal quantizer (period is honored by the worker `setInterval`).
 */
export abstract class Generator {
  constructor(readonly periodMs = DEFAULT_PERIOD_MS) {}

  protected abstract sample(time: number): number;

  /** Internal quantizer: forward the sample, then park for `periodMs`. */
  protected quantized(c: DoubleConsumer): DoubleConsumer {
    const periodNs = periodMsFrom(this.periodMs) * 1_000_000;
    return (value) => {
      c(value);
      parkNanos(periodNs);
    };
  }

  run(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
    const sink = this.quantized(c);
    while (running()) {
      sink(this.sample(now()));
    }
  }
}

export class TimerGenerator extends Generator {
  protected sample(time: number): number {
    return time;
  }
}

export class SinGenerator extends Generator {
  protected sample(time: number): number {
    return Math.sin(time);
  }
}

export class CosGenerator extends Generator {
  protected sample(time: number): number {
    return Math.cos(time);
  }
}

export class RandomGenerator extends Generator {
  protected sample(_time: number): number {
    return Math.random();
  }
}

const GENERATORS: Record<string, new (periodMs?: number) => Generator> = {
  timer: TimerGenerator,
  sin: SinGenerator,
  cos: CosGenerator,
  random: RandomGenerator,
};

export function generatorFor(defId: string, periodMs = DEFAULT_PERIOD_MS): Generator | undefined {
  const Ctor = GENERATORS[defId];
  return Ctor ? new Ctor(periodMs) : undefined;
}

/** Accepts a sink and pushes timestamps while `running`. */
export function timer(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
  new TimerGenerator().run(c, running, now);
}

/** Accepts a sink and pushes `sin(time)` while `running`. */
export function sin(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
  new SinGenerator().run(c, running, now);
}

/** Accepts a sink and pushes `cos(time)` while `running`. */
export function cos(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
  new CosGenerator().run(c, running, now);
}

/** Accepts a sink and pushes random samples in `[0, 1)` while `running`. */
export function random(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
  new RandomGenerator().run(c, running, now);
}

/** Plot sink — returns a vector of `c<f64>` channels. */
export function scope(...plots: DoubleConsumer[]): DoubleConsumer[] {
  return plots;
}

/** Hidden runtime fan-out: one `c<f64>` that forwards each sample to every downstream. */
export function fork(...downstreams: DoubleConsumer[]): DoubleConsumer {
  if (downstreams.length === 1) {
    return downstreams[0];
  }
  return (v) => {
    for (const downstream of downstreams) {
      downstream(v);
    }
  };
}

export class SampleBuf {
  private inner: number[] = [];

  push(value: number): void {
    if (this.inner.length >= SAMPLE_CAP) {
      this.inner.shift();
    }
    this.inner.push(value);
  }

  snapshot(): number[] {
    return [...this.inner];
  }

  clear(): void {
    this.inner = [];
  }
}

export function nowSecs(): number {
  return Date.now() / 1000;
}

export function sinFunc(sink: F64Func): F64Func {
  return (value) => sink(Math.sin(value));
}

/** @deprecated Use {@link sinFunc}. */
export const sinConsumer = sinFunc;

export interface NodeSpec {
  id: number;
  defId: string;
  periodMs?: number;
}

/** Push-model consumer tree: `sin(fork(plot[0], plot[1]))`. */
export type ConsumerTree =
  | { kind: "scope"; id: number }
  | { kind: "fork"; inner: ConsumerTree[] };

/** One ring / plot channel on a scope. */
export interface ScopeChannel {
  scopeId: number;
  label: string;
}

/** Live samples for one multi-axis dataset. */
export interface ScopeSeries {
  label: string;
  samples: number[];
}

export interface GeneratorPlan {
  generatorId: number;
  /** @deprecated Use {@link generatorId}. */
  timerId: number;
  defId: string;
  scopeId: number;
  scopeIds: number[];
  channels: ScopeChannel[];
  delayMs: number;
  tree: ConsumerTree;
}

function incomingTo(links: Link[], to: number, port: string): Link[] {
  const catalog = catalogPortName(port);
  return links
    .filter((link) => link.toBlock === to && catalogPortName(link.toIn) === catalog)
    .toSorted(
      (left, right) =>
        portSlotIndex(left.toIn) - portSlotIndex(right.toIn) ||
        left.fromBlock - right.fromBlock ||
        portSlotIndex(left.fromOut) - portSlotIndex(right.fromOut) ||
        left.fromOut.localeCompare(right.fromOut),
    );
}

function walkConsumer(
  id: number,
  defOf: (id: number) => string | undefined,
  links: Link[],
  depth: number,
): ConsumerTree | undefined {
  if (depth > 64) {
    return undefined;
  }
  const parts: ConsumerTree[] = [];
  for (const link of incomingTo(links, id, "in")) {
    const fromDef = defOf(link.fromBlock);
    if (fromDef === "scope") {
      parts.push({ kind: "scope", id: link.fromBlock });
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return { kind: "fork", inner: parts };
}

export function collectScopeIds(tree: ConsumerTree): number[] {
  return [...new Set(collectChannels(tree).map((channel) => channel.scopeId))];
}

export function collectChannels(tree: ConsumerTree, label = "out"): ScopeChannel[] {
  if (tree.kind === "scope") {
    return [{ scopeId: tree.id, label }];
  }
  return tree.inner.flatMap((child) => collectChannels(child, label));
}

/** Walk Scope → Generator (sink flow), inserting a hidden fork when an input has many sources. */
export function planGenerator(generatorId: number, nodes: NodeSpec[], links: Link[]): GeneratorPlan | undefined {
  const node = nodes.find((item) => item.id === generatorId);
  if (!node || !isGeneratorId(node.defId)) {
    return undefined;
  }
  const defOf = (id: number): string | undefined => nodes.find((item) => item.id === id)?.defId;
  const tree = walkConsumer(generatorId, defOf, links, 0);
  if (!tree) {
    return undefined;
  }
  const channels = collectChannels(tree, node.defId);
  const scopeIds = [...new Set(channels.map((channel) => channel.scopeId))];
  if (scopeIds.length === 0) {
    return undefined;
  }
  return {
    generatorId,
    timerId: generatorId,
    defId: node.defId,
    scopeId: scopeIds[0],
    scopeIds,
    channels,
    delayMs: periodMsFrom(node.periodMs),
    tree,
  };
}

/** @deprecated Prefer {@link planGenerator}; kept for in-process tests. */
export interface CompiledTimer {
  emit: F64Func;
  delayMs: number;
}

export function compileTimer(
  generatorId: number,
  nodes: NodeSpec[],
  links: Link[],
  buffers: Map<number, SampleBuf>,
): CompiledTimer | undefined {
  const plan = planGenerator(generatorId, nodes, links);
  if (!plan) {
    return undefined;
  }
  const emitFor = (tree: ConsumerTree, next = { n: 0 }): F64Func => {
    if (tree.kind === "scope") {
      const ring = next.n;
      next.n += 1;
      const leaf = buffers.get(ring);
      return (value) => leaf?.push(value);
    }
    return fork(...tree.inner.map((child) => emitFor(child, next)));
  };
  const sink = emitFor(plan.tree);
  return {
    emit: (time) => sink(sampleOnce(plan.defId, time)),
    delayMs: plan.delayMs,
  };
}

function sampleOnce(defId: string, time: number): number {
  switch (defId) {
    case "sin":
      return Math.sin(time);
    case "cos":
      return Math.cos(time);
    case "random":
      return Math.random();
    default:
      return time;
  }
}

export function spawnTimer(compiled: CompiledTimer, running: { value: boolean }): () => void {
  const delay = Math.max(compiled.delayMs, 1);
  const fire = (): void => {
    if (!running.value) {
      return;
    }
    compiled.emit(nowSecs());
  };
  fire();
  const interval = setInterval(() => {
    if (!running.value) {
      clearInterval(interval);
      return;
    }
    compiled.emit(nowSecs());
  }, delay);
  return () => {
    running.value = false;
    clearInterval(interval);
  };
}

export function stop(running: { value: boolean }): void {
  running.value = false;
}
