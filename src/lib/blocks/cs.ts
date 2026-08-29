import type { Link } from "./diagram";
import { encodeLibrary } from "../runtime/encode";
import { SAMPLE_CAP } from "../runtime/memory";

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
  wasm: Uint8Array;
}

/** Walk Timer → … → Oscilloscope and emit the wasm-gc library for that generator. */
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
    wat: generatorWat(stages, delayMs),
    wasm: encodeLibrary(stages, delayMs),
  };
}

function composeTick(stages: readonly Stage[]): string {
  let expr = `(call_ref $fn_timer (ref.func $timer))`;
  for (const stage of stages) {
    if (stage === "quantizer") {
      expr = `(call_ref $fn_map ${expr} (ref.func $quantizer))`;
    } else {
      expr = `(call_ref $fn_map ${expr} (ref.func $sin))`;
    }
  }
  return `(call_ref $fn_sink ${expr} (ref.func $oscilloscope))`;
}

/**
 * WASM library for the XML block catalog.
 * Each exported function matches the XML block: arguments are inputs, results are outputs.
 * Typed function references + call_ref (wasm-gc). Park uses memory.atomic.wait32 on shared memory.
 */
export function generatorWat(stages: readonly Stage[], delayMs = 0): string {
  const delayNs = BigInt(Math.max(delayMs, 1)) * 1_000_000n;
  const tick = composeTick(stages);
  return `(module
  (import "env" "memory" (memory 1 1 shared))
  (import "host" "now" (func $now (result f64)))
  (import "host" "sin" (func $host_sin (param f64) (result f64)))

  ;; Typed functions from the XML catalog (params = <in>, results = <out>).
  (type $fn_timer (func (result f64)))
  (type $fn_map (func (param f64) (result f64)))
  (type $fn_sink (func (param f64)))

  (func $push (param $v f64)
    (local $i i32)
    (local.set $i (i32.load (i32.const 4)))
    (f64.store offset=16
      (i32.mul (i32.rem_u (local.get $i) (i32.const ${SAMPLE_CAP})) (i32.const 8))
      (local.get $v))
    (i32.store (i32.const 4) (i32.add (local.get $i) (i32.const 1))))

  (func $park (param $ns i64)
    (if (i64.gt_s (local.get $ns) (i64.const 0))
      (then
        (drop (memory.atomic.wait32 (i32.const 8) (i32.const 0) (local.get $ns))))))

  (func $stopped (result i32)
    (i32.atomic.load (i32.const 0)))

  ;; timer: () -> f64
  (func $timer (export "timer") (type $fn_timer)
    (call $now))

  ;; quantizer: (f64) -> f64
  (func $quantizer (export "quantizer") (type $fn_map)
    (local.get 0))

  ;; sin: (f64) -> f64
  (func $sin (export "sin") (type $fn_map)
    (call $host_sin (local.get 0)))

  ;; oscilloscope: (f64) -> void
  (func $oscilloscope (export "oscilloscope") (type $fn_sink)
    (call $push (local.get 0)))

  (elem declare func $timer $quantizer $sin $oscilloscope)

  (func $tick (export "tick")
    ${tick})

  (func $run (export "run")
    (loop $again
      (call $tick)
      (call $park (i64.const ${delayNs}))
      (br_if $again (i32.eqz (call $stopped)))))
)
`;
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
