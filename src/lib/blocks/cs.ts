import type { Link } from "./diagram";
import { type Stage, assembleModule, assembleWasm } from "../runtime/assemble";
import { SAMPLE_CAP } from "../runtime/memory";

export const QUANTIZER_DELAY_MS = 10;

/** Language-agnostic consumer `c1<T>` / Java `Consumer<T>`. */
export type Func<T> = (value: T) => void;
/** Java `DoubleConsumer` — catalog `c<f64>`. */
export type DoubleConsumer = Func<number>;
export type F64Func = DoubleConsumer;
/**
 * Java `Consumer<DoubleConsumer>` — catalog `c<c<f64>>`.
 * A push source: give it a sink and it pushes samples.
 */
export type DoubleSource = Func<DoubleConsumer>;
export type F64Source = DoubleSource;
/** @deprecated Same as {@link DoubleSource}; depth tags are gone. */
export type Nested = DoubleSource;

/**
 * In-process model of the catalog (compact display writes c1 as c):
 *
 *   timer(running)        : c<c<f64>>
 *   quantizer(period, c)  : c<c<f64>> → c<c<f64>>
 *   sin(c)                : c<c<f64>> → c<c<f64>>
 *   oscilloscope(c, plot) : c<c<f64>> → void     // c(plot)
 *
 * Composition: sin(quantizer(period, timer(running)))(plot)
 *
 * The WASM runtime still lowers each sample port to first-order f64
 * (timer : s<f64>, quantizer/sin : f1<f64, f64>, oscilloscope : c1<f64>).
 */

/** Java `timer(BooleanSupplier running)` — `Consumer<DoubleConsumer>`. */
export function timer(running: () => boolean, now: () => number = nowSecs): DoubleSource {
  return (c) => {
    while (running()) {
      c(now());
    }
  };
}

/** Java `quantizer(long period, Consumer<DoubleConsumer> c)`. `period` is nanoseconds. */
export function quantizer(periodNs: number, c: DoubleSource): DoubleSource {
  return (dc) =>
    c((v) => {
      dc(v);
      parkNanos(periodNs);
    });
}

/** Java `sin(Consumer<DoubleConsumer> c)` — `Consumer<DoubleConsumer>`. */
export function sin(c: DoubleSource): DoubleSource {
  return (dc) => c((v) => dc(Math.sin(v)));
}

/** `c.accept(plot)` — plot is a `DoubleConsumer`. */
export function oscilloscope(c: DoubleSource, plot: DoubleConsumer): void {
  c(plot);
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
  delayMs: number;
  stages: Stage[];
}

export interface CompiledGenerator extends GeneratorPlan {
  text: string;
  wasm: Uint8Array;
}

/** Walk Timer → … → Oscilloscope. Does not compile WASM. */
export function planGenerator(timerId: number, nodes: NodeSpec[], links: Link[]): GeneratorPlan | undefined {
  const defOf = (id: number): string | undefined => nodes.find((node) => node.id === id)?.defId;
  const outgoing = (from: number, port: string): Link | undefined =>
    links.find((link) => link.fromBlock === from && link.fromOut === port);

  const stages: Stage[] = [];
  let cursor = timerId;
  let scopeId: number | undefined;
  for (let i = 0; i < 64; i += 1) {
    const link = outgoing(cursor, "out");
    if (!link) {
      break;
    }
    const toDef = defOf(link.toBlock);
    if (!toDef) {
      return undefined;
    }
    if (toDef === "quantizer" || toDef === "sin") {
      stages.push(toDef);
      cursor = link.toBlock;
    } else if (toDef === "oscilloscope") {
      scopeId = link.toBlock;
      break;
    } else {
      break;
    }
  }
  if (scopeId === undefined) {
    return undefined;
  }
  let delayMs = 0;
  for (const stage of stages) {
    if (stage === "quantizer") {
      delayMs += QUANTIZER_DELAY_MS;
    }
  }
  return { timerId, scopeId, delayMs, stages };
}

/** Run each block's binaryen.js script and emit wasm for this pipeline. */
export async function assembleGenerator(plan: Pick<GeneratorPlan, "stages" | "delayMs">): Promise<Uint8Array> {
  return assembleWasm({ stages: plan.stages, delayMs: plan.delayMs });
}

/**
 * Walk Timer → … → Oscilloscope, then generate the module with binaryen.js.
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
  let emit: F64Func = (value) => buf.push(value);
  for (const stage of [...compiled.stages].reverse()) {
    if (stage === "sin") {
      emit = sinFunc(emit);
    }
  }
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
