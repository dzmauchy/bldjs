import type { Link } from "./diagram";
import { type Stage, assembleWat } from "../runtime/assemble";
import { SAMPLE_CAP } from "../runtime/memory";
import { compileWat } from "../runtime/wat";

export const QUANTIZER_DELAY_MS = 10;

/** WASM `func<T>` — a typed function that consumes `T`. */
export type Func<T> = (value: T) => void;
export type F64Func = Func<number>;
/** WASM `func<func<f64>>` — a push source. */
export type F64Source = Func<F64Func>;

/**
 * Nested typed functions kept for in-process tests.
 * The XML / wasm-gc library uses first-order signatures:
 *   timer() : (result f64)
 *   quantizer / sin : (param f64) (result f64)
 *   oscilloscope : (param f64)
 */
export interface Nested<D extends 1 | 2 | 3> {
  readonly depth: D;
  readonly source: F64Source;
}

export function timer(now: () => number = nowSecs): Nested<3> {
  return { depth: 3, source: (sink) => sink(now()) };
}

export function quantizer(input: Nested<3>, delayMs = QUANTIZER_DELAY_MS): Nested<2> {
  return {
    depth: 2,
    source: (sink) => {
      input.source((value) => {
        park(delayMs);
        sink(value);
      });
    },
  };
}

export function sin(input: Nested<2>): Nested<1> {
  return {
    depth: 1,
    source: (sink) => input.source((value) => sink(Math.sin(value))),
  };
}

export function oscilloscope(input: Nested<1>, sink: F64Func): void {
  input.source(sink);
}

function park(delayMs: number): void {
  if (delayMs <= 0) {
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
  wat: string;
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

/** Concatenate block WAT files and emit tick/run for this pipeline. */
export function assembleGenerator(plan: Pick<GeneratorPlan, "stages" | "delayMs">): string {
  return assembleWat({ stages: plan.stages, delayMs: plan.delayMs });
}

/**
 * Walk Timer → … → Oscilloscope, assemble block WAT, then compile the module.
 * `runDiagram` does the same assemble-then-compile step when the simulation starts.
 */
export function compileGenerator(
  timerId: number,
  nodes: NodeSpec[],
  links: Link[],
): CompiledGenerator | undefined {
  const plan = planGenerator(timerId, nodes, links);
  if (!plan) {
    return undefined;
  }
  const wat = assembleGenerator(plan);
  return { ...plan, wat, wasm: compileWat(wat) };
}

/** Assemble the catalog block WAT files into one module. */
export function generatorWat(stages: readonly Stage[], delayMs = 0): string {
  return assembleWat({ stages, delayMs });
}

/** @deprecated Prefer {@link compileGenerator}; kept for in-process tests. */
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
  const compiled = compileGenerator(timerId, nodes, links);
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
