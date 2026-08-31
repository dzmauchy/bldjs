import { CTX, MEM, RING_STRIDE, SAMPLE_CAP } from "../../lib/runtime/memory";

const RING1_COUNT = CTX + 16;

/** Host imports, memory constants, and `push_at` used by every assembled generator. */
export function runtimeAs(): string {
  return `@external("host", "now")
declare function now(): f64;

@external("host", "sin")
declare function host_sin(v: f64): f64;

@external("host", "cos")
declare function host_cos(v: f64): f64;

const CTX: i32 = ${CTX};
const SAMPLE_CAP: i32 = ${SAMPLE_CAP};
const RING_STRIDE: i32 = ${RING_STRIDE};
const RING0_COUNT: i32 = ${MEM.count};
const RING0_SAMPLES: i32 = ${MEM.samples};
const RING1_COUNT: i32 = ${RING1_COUNT};

@inline
function push_at(v: f64, buf: i32): void {
  const count_addr: i32 = buf == 0 ? RING0_COUNT : RING1_COUNT + (buf - 1) * RING_STRIDE;
  const samples: i32 = buf == 0 ? RING0_SAMPLES : count_addr + 8;
  const i: i32 = load<i32>(count_addr);
  store<f64>(samples + (i % SAMPLE_CAP) * 8, v);
  store<i32>(count_addr, i + 1);
}

@inline
function nop(_v: f64): void {}
`;
}

export interface CompileAsOptions {
  sharedMemory: boolean;
}

export function compileOptions(options: CompileAsOptions): Record<string, unknown> {
  return {
    runtime: "stub",
    importMemory: true,
    noExportMemory: true,
    initialMemory: 1,
    maximumMemory: 1,
    zeroFilledMemory: true,
    // O3 is far too slow in the browser; the generator is tiny.
    optimizeLevel: 1,
    noAssert: true,
    noColors: true,
    ...(options.sharedMemory ? { sharedMemory: true, enable: ["threads"] } : {}),
  };
}
