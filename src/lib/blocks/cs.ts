import type { Link } from "./diagram";
import {
  type Stage,
  type TickSink,
  assembleModule,
  assembleWasm,
} from "../runtime/assemble";
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

/** Fan one sample out to two sinks: `c<f64> fork(c<f64> d1, c<f64> d2)`. */
export function fork(d1: DoubleConsumer, d2: DoubleConsumer): DoubleConsumer {
  return (value) => {
    d1(value);
    d2(value);
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

export interface GeneratorPlan {
  timerId: number;
  scopeId: number;
  scopeIds: number[];
  delayMs: number;
  stages: Stage[];
  sink: TickSink;
}

export interface CompiledGenerator extends GeneratorPlan {
  text: string;
  wasm: Uint8Array;
}

function linearStages(sink: TickSink): Stage[] {
  const stages: Stage[] = [];
  let cursor: TickSink = sink;
  while (cursor.kind !== "scope" && cursor.kind !== "fork") {
    stages.push(cursor.kind);
    cursor = cursor.then;
  }
  return stages;
}

/** Walk Timer ← … ← Oscilloscope (sink flow). Quantizer must sit on Timer.sync. */
export function planGenerator(timerId: number, nodes: NodeSpec[], links: Link[]): GeneratorPlan | undefined {
  const defOf = (id: number): string | undefined => nodes.find((node) => node.id === id)?.defId;
  const incoming = (to: number, port: string): Link | undefined =>
    links.find((link) => link.toBlock === to && link.toIn === port);

  const sync = incoming(timerId, "sync");
  if (!sync || defOf(sync.fromBlock) !== "quantizer") {
    return undefined;
  }

  const scopeIds: number[] = [];
  const walk = (id: number): TickSink | undefined => {
    const def = defOf(id);
    if (def === "oscilloscope") {
      scopeIds.push(id);
      return { kind: "scope" };
    }
    if (def === "sin" || def === "cos") {
      const link = incoming(id, "in");
      if (!link) {
        return undefined;
      }
      const then = walk(link.fromBlock);
      return then ? { kind: def, then } : undefined;
    }
    if (def === "fork") {
      const d1 = incoming(id, "d1");
      const d2 = incoming(id, "d2");
      if (!d1 || !d2) {
        return undefined;
      }
      const left = walk(d1.fromBlock);
      const right = walk(d2.fromBlock);
      return left && right ? { kind: "fork", d1: left, d2: right } : undefined;
    }
    return undefined;
  };

  const input = incoming(timerId, "in");
  if (!input) {
    return undefined;
  }
  const inner = walk(input.fromBlock);
  if (!inner || scopeIds.length === 0) {
    return undefined;
  }
  const sink: TickSink = { kind: "quantizer", then: inner };
  return {
    timerId,
    scopeId: scopeIds[0],
    scopeIds,
    delayMs: QUANTIZER_DELAY_MS,
    stages: linearStages(sink),
    sink,
  };
}

/** Run each block's binaryen.js script and emit wasm for this pipeline. */
export async function assembleGenerator(
  plan: Pick<GeneratorPlan, "stages" | "delayMs" | "sink">,
): Promise<Uint8Array> {
  return assembleWasm({ stages: plan.stages, sink: plan.sink, delayMs: plan.delayMs });
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
  const assembled = await assembleModule(plan);
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
  const buf = buffers.get(compiled.scopeId);
  if (!buf) {
    return undefined;
  }
  const emitFrom = (node: TickSink, plot: F64Func): F64Func => {
    switch (node.kind) {
      case "scope":
        return plot;
      case "sin":
        return sin(emitFrom(node.then, plot));
      case "cos":
        return cos(emitFrom(node.then, plot));
      case "quantizer":
        return emitFrom(node.then, plot);
      case "fork":
        return fork(emitFrom(node.d1, plot), emitFrom(node.d2, plot));
    }
  };
  return { emit: emitFrom(compiled.sink, (value) => buf.push(value)), delayMs: compiled.delayMs };
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
