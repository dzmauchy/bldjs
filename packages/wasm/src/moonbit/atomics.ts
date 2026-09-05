/** Threads opcode prefix (`0xFE`). */
export const THREADS_PREFIX = 0xfe;

/**
 * i32 atomic opcode immediates after {@link THREADS_PREFIX}.
 * https://webassembly.github.io/threads/core/binary/instructions.html
 */
export const I32_ATOMIC_OPCODE = {
  load: 0x10,
  store: 0x17,
  add: 0x1e,
  sub: 0x25,
  and: 0x2c,
  or: 0x33,
  xor: 0x3a,
  xchg: 0x41,
  cmpxchg: 0x48,
} as const;

export type I32AtomicOp = keyof typeof I32_ATOMIC_OPCODE;

export interface I32AtomicFn {
  /** MoonBit function name. */
  name: string;
  /** WAT instruction inlined by `extern "wasm"`. */
  instruction: string;
  opcode: number;
  params: string;
  result: string;
  watParams: string;
  watResult: string;
  watBody: string;
  /** Statement that uses the function so moonc keeps it. */
  use: string;
}

interface AtomicSpec {
  op: I32AtomicOp;
  instruction: string;
  params: readonly string[];
  result: "Int" | "Unit";
}

const I32_ATOMIC_SPECS: readonly AtomicSpec[] = [
  { op: "load", instruction: "i32.atomic.load", params: ["addr"], result: "Int" },
  { op: "store", instruction: "i32.atomic.store", params: ["addr", "value"], result: "Unit" },
  { op: "add", instruction: "i32.atomic.rmw.add", params: ["addr", "value"], result: "Int" },
  { op: "sub", instruction: "i32.atomic.rmw.sub", params: ["addr", "value"], result: "Int" },
  { op: "and", instruction: "i32.atomic.rmw.and", params: ["addr", "value"], result: "Int" },
  { op: "or", instruction: "i32.atomic.rmw.or", params: ["addr", "value"], result: "Int" },
  { op: "xor", instruction: "i32.atomic.rmw.xor", params: ["addr", "value"], result: "Int" },
  { op: "xchg", instruction: "i32.atomic.rmw.xchg", params: ["addr", "value"], result: "Int" },
  {
    op: "cmpxchg",
    instruction: "i32.atomic.rmw.cmpxchg",
    params: ["addr", "expected", "replacement"],
    result: "Int",
  },
];

function watParams(count: number): string {
  return Array.from({ length: count }, () => "(param i32)").join(" ");
}

function watBody(instruction: string, count: number): string {
  const gets = Array.from({ length: count }, (_, index) => `(local.get ${index})`).join(" ");
  return `(${instruction} ${gets})`;
}

function dummyArgs(params: readonly string[]): string {
  return params.map((name, index) => (name === "expected" || index === 0 ? "0" : "1")).join(", ");
}

function atomicFn(spec: AtomicSpec): I32AtomicFn {
  const name = `i32_atomic_${spec.op}`;
  const count = spec.params.length;
  const call = `${name}(${dummyArgs(spec.params)})`;
  return {
    name,
    instruction: spec.instruction,
    opcode: I32_ATOMIC_OPCODE[spec.op],
    params: spec.params.map((name) => `${name} : Int`).join(", "),
    result: spec.result,
    watParams: watParams(count),
    watResult: spec.result === "Int" ? "(result i32)" : "",
    watBody: watBody(spec.instruction, count),
    use: spec.result === "Int" ? `let _ = ${call}` : call,
  };
}

function watFunc(fn: Pick<I32AtomicFn, "watParams" | "watResult" | "watBody">): string {
  const result = fn.watResult ? ` ${fn.watResult}` : "";
  return `#|(func ${fn.watParams}${result}
  #|  ${fn.watBody}
  #|)`;
}

function emitExtern(fn: I32AtomicFn): string {
  return `extern "wasm" fn ${fn.name}(${fn.params}) -> ${fn.result} =
${watFunc(fn)}`;
}

/** MoonBit `extern "wasm"` wrappers for i32 atomics. Not wait. */
export const I32_ATOMICS: readonly I32AtomicFn[] = I32_ATOMIC_SPECS.map(atomicFn);

export function emitI32Atomic(fn: I32AtomicFn): string {
  return emitExtern(fn);
}

/** Full i32 atomic library as MoonBit `extern "wasm"` functions. */
export function emitI32Atomics(fns: readonly I32AtomicFn[] = I32_ATOMICS): string {
  return fns.map(emitI32Atomic).join("\n");
}

export function i32Atomic(name: I32AtomicOp): I32AtomicFn {
  const fn = I32_ATOMICS.find((item) => item.opcode === I32_ATOMIC_OPCODE[name]);
  if (!fn) {
    throw new Error(`missing i32 atomic ${name}`);
  }
  return fn;
}

/** True when `wasm` contains threads prefix + `opcode`. */
export function hasThreadsOpcode(wasm: Uint8Array, opcode: number): boolean {
  for (let i = 0; i < wasm.length - 1; i += 1) {
    if (wasm[i] === THREADS_PREFIX && wasm[i + 1] === opcode) {
      return true;
    }
  }
  return false;
}
