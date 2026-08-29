import type { Link } from "./diagram";

export const QUANTIZER_DELAY_MS = 10;
const SAMPLE_CAP = 480;

/** WASM `func<T>` — a typed function that consumes `T`. */
export type Func<T> = (value: T) => void;
export type F64Func = Func<number>;
/** WASM `func<func<f64>>` — a push source. */
export type F64Source = Func<F64Func>;

/**
 * Nested typed functions. Depth matches the catalog:
 *   Nested<3> = fn<fn<fn<f64>>>  (Timer)
 *   Nested<2> = fn<fn<f64>>      (Quantizer)
 *   Nested<1> = fn<f64>          (Sin / Scope)
 *
 * The payload is always a source; each function peels one func layer
 * so `oscilloscope(sin(quantizer(timer())))` type-checks like WASM.
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

type Stage = "sin" | "quantizer";

export interface NodeSpec {
  id: number;
  defId: string;
}

export interface CompiledGenerator {
  timerId: number;
  scopeId: number;
  delayMs: number;
  stages: Stage[];
  wat: string;
}

/** Walk Timer → … → Oscilloscope and emit typed-function WAT for that generator. */
export function compileGenerator(
  timerId: number,
  nodes: NodeSpec[],
  links: Link[],
): CompiledGenerator | undefined {
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
  return {
    timerId,
    scopeId,
    delayMs,
    stages,
    wat: generatorWat(stages),
  };
}

/**
 * WASM text with a typed `func (param f64)` per pipeline stage.
 * Host imports: `now`, `sin`, `park`, `push`. Export: `tick`.
 */
export function generatorWat(stages: readonly Stage[]): string {
  const funcs: string[] = [
    `  (type $fn_f64 (func (param f64)))`,
    `  (type $fn_tick (func))`,
    `  (import "host" "now" (func $now (result f64)))`,
    `  (import "host" "sin" (func $sin (param f64) (result f64)))`,
    `  (import "host" "park" (func $park))`,
    `  (import "host" "push" (func $push (param f64)))`,
  ];

  const stageNames: string[] = [];
  let next = "$consume";
  funcs.push(
    `  (func $consume (type $fn_f64)`,
    `    (call $push (local.get 0)))`,
  );
  stageNames.push("$consume");

  for (const stage of [...stages].reverse()) {
    if (stage === "sin") {
      const name = `$apply_sin_${stageNames.length}`;
      funcs.push(
        `  (func ${name} (type $fn_f64)`,
        `    (call ${next} (call $sin (local.get 0))))`,
      );
      next = name;
      stageNames.push(name);
    } else {
      const name = `$apply_quantizer_${stageNames.length}`;
      funcs.push(
        `  (func ${name} (type $fn_f64)`,
        `    (call $park)`,
        `    (call ${next} (local.get 0)))`,
      );
      next = name;
      stageNames.push(name);
    }
  }

  funcs.push(
    `  (table $fns ${stageNames.length} funcref)`,
    `  (elem (i32.const 0) ${stageNames.join(" ")})`,
    `  (func $tick (type $fn_tick)`,
    `    (call ${next} (call $now)))`,
    `  (export "tick" (func $tick))`,
  );

  return `(module\n${funcs.join("\n")}\n)\n`;
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
  const delay = Math.max(compiled.delayMs, 1);
  const tick = () => {
    if (!running.value) {
      return;
    }
    compiled.emit(nowSecs());
    handle = setTimeout(tick, delay);
  };
  let handle: ReturnType<typeof setTimeout> | undefined = setTimeout(tick, 0);
  return () => {
    running.value = false;
    if (handle !== undefined) {
      clearTimeout(handle);
    }
  };
}

export function stop(running: { value: boolean }): void {
  running.value = false;
}
