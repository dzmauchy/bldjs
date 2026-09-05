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

const I32 = "(param i32)";
const I32_I32 = "(param i32) (param i32)";
const I32_I32_I32 = "(param i32) (param i32) (param i32)";
const RESULT_I32 = "(result i32)";

/** MoonBit `extern "wasm"` wrappers for i32 atomics. Not wait. */
export const I32_ATOMICS: readonly I32AtomicFn[] = [
  {
    name: "i32_atomic_load",
    instruction: "i32.atomic.load",
    opcode: I32_ATOMIC_OPCODE.load,
    params: "addr : Int",
    result: "Int",
    watParams: I32,
    watResult: RESULT_I32,
    watBody: "(i32.atomic.load (local.get 0))",
    use: "let _ = i32_atomic_load(0)",
  },
  {
    name: "i32_atomic_store",
    instruction: "i32.atomic.store",
    opcode: I32_ATOMIC_OPCODE.store,
    params: "addr : Int, value : Int",
    result: "Unit",
    watParams: I32_I32,
    watResult: "",
    watBody: "(i32.atomic.store (local.get 0) (local.get 1))",
    use: "i32_atomic_store(0, 1)",
  },
  {
    name: "i32_atomic_add",
    instruction: "i32.atomic.rmw.add",
    opcode: I32_ATOMIC_OPCODE.add,
    params: "addr : Int, value : Int",
    result: "Int",
    watParams: I32_I32,
    watResult: RESULT_I32,
    watBody: "(i32.atomic.rmw.add (local.get 0) (local.get 1))",
    use: "let _ = i32_atomic_add(0, 1)",
  },
  {
    name: "i32_atomic_sub",
    instruction: "i32.atomic.rmw.sub",
    opcode: I32_ATOMIC_OPCODE.sub,
    params: "addr : Int, value : Int",
    result: "Int",
    watParams: I32_I32,
    watResult: RESULT_I32,
    watBody: "(i32.atomic.rmw.sub (local.get 0) (local.get 1))",
    use: "let _ = i32_atomic_sub(0, 1)",
  },
  {
    name: "i32_atomic_and",
    instruction: "i32.atomic.rmw.and",
    opcode: I32_ATOMIC_OPCODE.and,
    params: "addr : Int, value : Int",
    result: "Int",
    watParams: I32_I32,
    watResult: RESULT_I32,
    watBody: "(i32.atomic.rmw.and (local.get 0) (local.get 1))",
    use: "let _ = i32_atomic_and(0, 1)",
  },
  {
    name: "i32_atomic_or",
    instruction: "i32.atomic.rmw.or",
    opcode: I32_ATOMIC_OPCODE.or,
    params: "addr : Int, value : Int",
    result: "Int",
    watParams: I32_I32,
    watResult: RESULT_I32,
    watBody: "(i32.atomic.rmw.or (local.get 0) (local.get 1))",
    use: "let _ = i32_atomic_or(0, 1)",
  },
  {
    name: "i32_atomic_xor",
    instruction: "i32.atomic.rmw.xor",
    opcode: I32_ATOMIC_OPCODE.xor,
    params: "addr : Int, value : Int",
    result: "Int",
    watParams: I32_I32,
    watResult: RESULT_I32,
    watBody: "(i32.atomic.rmw.xor (local.get 0) (local.get 1))",
    use: "let _ = i32_atomic_xor(0, 1)",
  },
  {
    name: "i32_atomic_xchg",
    instruction: "i32.atomic.rmw.xchg",
    opcode: I32_ATOMIC_OPCODE.xchg,
    params: "addr : Int, value : Int",
    result: "Int",
    watParams: I32_I32,
    watResult: RESULT_I32,
    watBody: "(i32.atomic.rmw.xchg (local.get 0) (local.get 1))",
    use: "let _ = i32_atomic_xchg(0, 1)",
  },
  {
    name: "i32_atomic_cmpxchg",
    instruction: "i32.atomic.rmw.cmpxchg",
    opcode: I32_ATOMIC_OPCODE.cmpxchg,
    params: "addr : Int, expected : Int, replacement : Int",
    result: "Int",
    watParams: I32_I32_I32,
    watResult: RESULT_I32,
    watBody: "(i32.atomic.rmw.cmpxchg (local.get 0) (local.get 1) (local.get 2))",
    use: "let _ = i32_atomic_cmpxchg(0, 0, 1)",
  },
];

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
