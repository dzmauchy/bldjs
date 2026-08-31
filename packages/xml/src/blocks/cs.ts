import type { Link } from "./diagram";
import { catalogPortName, portSlotIndex } from "./ports";

export const QUANTIZER_DELAY_MS = 10;

/** Shared sample ring capacity for CS scope buffers and the WASM runner. */
export const SAMPLE_CAP = 480;

/** Push-model stages between Scope and Timer. */
export type Stage = "sin" | "cos" | "quantizer";

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
 *   timer(c)              : c<f64> → void
 *   quantizer(c)          : c<f64> → c<f64>
 *   sin(c) / cos(c)       : c<f64> → c<f64>
 *   scope()        : c<f64>[]            (vector of plot sinks)
 *
 * Composition: timer(sin(quantizer(plot[0])))
 *
 * Each Binaryen block repeats the XML signature plus runtime `$ctx i32`.
 */

/** Accepts a sink and pushes timestamps while `running`. */
export function timer(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
  while (running()) {
    c(now());
  }
}

/** Accepts a sink, returns a sink. Quantizer delay is applied by the generator `setInterval`. */
export function quantizer(c: DoubleConsumer, periodNs = QUANTIZER_DELAY_MS * 1_000_000): DoubleConsumer {
  return (v) => {
    c(v);
    parkNanos(periodNs);
  };
}

/** Accepts a sink, returns a sink. */
export function sin(c: DoubleConsumer): DoubleConsumer {
  return (v) => c(Math.sin(v));
}

/** Accepts a sink, returns a sink. */
export function cos(c: DoubleConsumer): DoubleConsumer {
  return (v) => c(Math.cos(v));
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

function parkNanos(periodNs: number): void {
  if (periodNs <= 0) {
    return;
  }
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
}

/** Push-model consumer tree: `timer(fork(sin(plot[0]), cos(plot[1])))`. */
export type ConsumerTree =
  | { kind: "scope"; id: number }
  | { kind: "stage"; stage: Stage; inner: ConsumerTree }
  | { kind: "fork"; inner: ConsumerTree[] };

/** One ring / Chart.js dataset on an scope. */
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
  timerId: number;
  scopeId: number;
  scopeIds: number[];
  channels: ScopeChannel[];
  delayMs: number;
  stages: Stage[];
  tree: ConsumerTree;
}

const PUSH_STAGES = new Set<Stage>(["quantizer", "sin", "cos"]);

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
    if (!fromDef) {
      continue;
    }
    if (fromDef === "scope") {
      parts.push({ kind: "scope", id: link.fromBlock });
    } else if (PUSH_STAGES.has(fromDef as Stage)) {
      const inner = walkConsumer(link.fromBlock, defOf, links, depth + 1);
      if (inner) {
        parts.push({ kind: "stage", stage: fromDef as Stage, inner });
      }
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

export function flattenStages(tree: ConsumerTree): Stage[] {
  if (tree.kind === "stage") {
    return [tree.stage, ...flattenStages(tree.inner)];
  }
  if (tree.kind === "fork") {
    return tree.inner.flatMap(flattenStages);
  }
  return [];
}

export function collectScopeIds(tree: ConsumerTree): number[] {
  return [...new Set(collectChannels(tree).map((channel) => channel.scopeId))];
}

export function collectChannels(tree: ConsumerTree, stages: Stage[] = []): ScopeChannel[] {
  if (tree.kind === "scope") {
    return [{ scopeId: tree.id, label: stages.length ? stages.join(" → ") : "out" }];
  }
  if (tree.kind === "stage") {
    return collectChannels(tree.inner, [...stages, tree.stage]);
  }
  return tree.inner.flatMap((child) => collectChannels(child, stages));
}

function applyStages(tree: ConsumerTree): Stage[] {
  if (tree.kind === "stage") {
    return [...applyStages(tree.inner), tree.stage];
  }
  if (tree.kind === "fork") {
    return tree.inner.flatMap(applyStages);
  }
  return [];
}

/** Walk Scope → … → Timer (sink flow), inserting a hidden fork when an input has many sources. */
export function planGenerator(timerId: number, nodes: NodeSpec[], links: Link[]): GeneratorPlan | undefined {
  const defOf = (id: number): string | undefined => nodes.find((node) => node.id === id)?.defId;
  const tree = walkConsumer(timerId, defOf, links, 0);
  if (!tree) {
    return undefined;
  }
  const channels = collectChannels(tree);
  const scopeIds = [...new Set(channels.map((channel) => channel.scopeId))];
  if (scopeIds.length === 0) {
    return undefined;
  }
  const stages = applyStages(tree);
  let delayMs = 0;
  for (const stage of flattenStages(tree)) {
    if (stage === "quantizer") {
      delayMs += QUANTIZER_DELAY_MS;
    }
  }
  return { timerId, scopeId: scopeIds[0], scopeIds, channels, delayMs, stages, tree };
}

/** @deprecated Prefer {@link planGenerator}; kept for in-process tests. */
export interface CompiledTimer {
  emit: F64Func;
  delayMs: number;
}

export function compileTimer(
  timerId: number,
  nodes: NodeSpec[],
  links: Link[],
  buffers: Map<number, SampleBuf>,
): CompiledTimer | undefined {
  const plan = planGenerator(timerId, nodes, links);
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
    if (tree.kind === "fork") {
      return fork(...tree.inner.map((child) => emitFor(child, next)));
    }
    const inner = emitFor(tree.inner, next);
    if (tree.stage === "sin") {
      return sin(inner);
    }
    if (tree.stage === "cos") {
      return cos(inner);
    }
    return inner;
  };
  const emit = emitFor(plan.tree);
  return { emit, delayMs: plan.delayMs };
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
