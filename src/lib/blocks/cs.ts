import type { Link } from "./diagram";
import { type ComposeTree, type Stage, assembleModule, assembleWasm } from "../runtime/assemble";
import { SAMPLE_CAP } from "../runtime/memory";

export const QUANTIZER_DELAY_MS = 10;

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
 *   oscilloscope()        : c<f64>              (plot sink)
 *
 * Composition: timer(sin(quantizer(plot)))
 *
 * The WASM runtime still lowers each sample port to first-order f64.
 */

/** Accepts a sink and pushes timestamps while `running`. */
export function timer(c: DoubleConsumer, running: () => boolean, now: () => number = nowSecs): void {
  while (running()) {
    c(now());
  }
}

/** Accepts a sink, returns a sink. Parks `periodNs` after each sample. */
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

/** Plot sink — the `c<f64>` Oscilloscope provides. */
export function oscilloscope(plot: DoubleConsumer): DoubleConsumer {
  return plot;
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

/** Push-model consumer tree: `timer(sin(fork(plot1, quantizer(plot2))))`. */
export type ConsumerTree =
  | { kind: "scope"; id: number }
  | { kind: "stage"; stage: Stage; inner: ConsumerTree }
  | { kind: "fork"; inner: ConsumerTree[] };

export interface GeneratorPlan {
  timerId: number;
  scopeId: number;
  scopeIds: number[];
  delayMs: number;
  stages: Stage[];
  tree: ConsumerTree;
}

export interface CompiledGenerator extends GeneratorPlan {
  text: string;
  wasm: Uint8Array;
}

const PUSH_STAGES = new Set<Stage>(["quantizer", "sin", "cos"]);

function incomingTo(links: Link[], to: number, port: string): Link[] {
  return links
    .filter((link) => link.toBlock === to && link.toIn === port)
    .toSorted((left, right) => left.fromBlock - right.fromBlock || left.fromOut.localeCompare(right.fromOut));
}

function walkConsumer(id: number, defOf: (id: number) => string | undefined, links: Link[], depth: number): ConsumerTree | undefined {
  if (depth > 64) {
    return undefined;
  }
  const parts: ConsumerTree[] = [];
  for (const link of incomingTo(links, id, "in")) {
    const fromDef = defOf(link.fromBlock);
    if (!fromDef) {
      continue;
    }
    if (fromDef === "oscilloscope") {
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
  if (tree.kind === "scope") {
    return [tree.id];
  }
  if (tree.kind === "stage") {
    return collectScopeIds(tree.inner);
  }
  return tree.inner.flatMap(collectScopeIds);
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

/** Walk Oscilloscope → … → Timer (sink flow), inserting a hidden fork when an input has many sources. */
export function planGenerator(timerId: number, nodes: NodeSpec[], links: Link[]): GeneratorPlan | undefined {
  const defOf = (id: number): string | undefined => nodes.find((node) => node.id === id)?.defId;
  const tree = walkConsumer(timerId, defOf, links, 0);
  if (!tree) {
    return undefined;
  }
  const scopeIds = collectScopeIds(tree);
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
  return { timerId, scopeId: scopeIds[0], scopeIds, delayMs, stages, tree };
}

export function toComposeTree(tree: ConsumerTree, scopeIds: number[]): ComposeTree {
  if (tree.kind === "scope") {
    return { kind: "scope", index: Math.max(0, scopeIds.indexOf(tree.id)) };
  }
  if (tree.kind === "stage") {
    return { kind: "stage", stage: tree.stage, inner: toComposeTree(tree.inner, scopeIds) };
  }
  return { kind: "fork", inner: tree.inner.map((child) => toComposeTree(child, scopeIds)) };
}

/** Run each block's binaryen.js script and emit wasm for this pipeline. */
export async function assembleGenerator(
  plan: Pick<GeneratorPlan, "stages" | "delayMs" | "tree" | "scopeIds">,
): Promise<Uint8Array> {
  return assembleWasm({
    stages: plan.stages,
    delayMs: plan.delayMs,
    tree: plan.tree ? toComposeTree(plan.tree, plan.scopeIds) : undefined,
  });
}

/**
 * Walk Oscilloscope → … → Timer (sink flow), then generate the module with binaryen.js.
 * `runDiagram` does the same assemble step when the simulation starts.
 */
export async function compileGenerator(
  timerId: number,
  nodes: NodeSpec[],
  links: Link[],
): Promise<CompiledGenerator | undefined> {
  const plan = planGenerator(timerId, nodes, links);
  if (!plan) {
    return undefined;
  }
  const assembled = await assembleModule({
    stages: plan.stages,
    delayMs: plan.delayMs,
    tree: toComposeTree(plan.tree, plan.scopeIds),
  });
  return { ...plan, text: assembled.text, wasm: assembled.wasm };
}

/** Assemble the catalog block scripts into one module and return binaryen text. */
export async function generatorText(stages: readonly Stage[], delayMs = 0): Promise<string> {
  return (await assembleModule({ stages, delayMs })).text;
}

/** @deprecated Prefer {@link generatorText}. */
export async function generatorWat(stages: readonly Stage[], delayMs = 0): Promise<string> {
  return generatorText(stages, delayMs);
}

/** @deprecated Prefer {@link compileGenerator}; kept for in-process tests. */
export interface CompiledTimer {
  emit: F64Func;
  delayMs: number;
}

export async function compileTimer(
  timerId: number,
  nodes: NodeSpec[],
  links: Link[],
  buffers: Map<number, SampleBuf>,
): Promise<CompiledTimer | undefined> {
  const compiled = await compileGenerator(timerId, nodes, links);
  if (!compiled) {
    return undefined;
  }
  if (compiled.scopeIds.some((id) => !buffers.has(id))) {
    return undefined;
  }
  const emitFor = (tree: ConsumerTree): F64Func => {
    if (tree.kind === "scope") {
      const leaf = buffers.get(tree.id);
      return (value) => leaf?.push(value);
    }
    if (tree.kind === "fork") {
      return fork(...tree.inner.map(emitFor));
    }
    const inner = emitFor(tree.inner);
    if (tree.stage === "sin") {
      return sin(inner);
    }
    if (tree.stage === "cos") {
      return cos(inner);
    }
    return inner;
  };
  const emit = emitFor(compiled.tree);
  return { emit, delayMs: compiled.delayMs };
}

export function spawnTimer(compiled: CompiledTimer, running: { value: boolean }): () => void {
  if (running.value) {
    compiled.emit(nowSecs());
  }
  return () => {
    running.value = false;
  };
}

export function stop(running: { value: boolean }): void {
  running.value = false;
}
