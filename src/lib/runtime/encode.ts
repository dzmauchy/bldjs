import { SAMPLE_CAP } from "./memory";

function u32(value: number): number[] {
  const out: number[] = [];
  let n = value >>> 0;
  do {
    const byte = n & 0x7f;
    n >>>= 7;
    out.push(n ? byte | 0x80 : byte);
  } while (n);
  return out;
}

function i64(value: bigint): number[] {
  const out: number[] = [];
  let n = value;
  while (true) {
    const byte = Number(n & 0x7fn);
    n >>= 7n;
    const done = (n === 0n && (byte & 0x40) === 0) || (n === -1n && (byte & 0x40) !== 0);
    out.push(done ? byte : byte | 0x80);
    if (done) {
      break;
    }
  }
  return out;
}

function vec(items: number[][]): number[] {
  return [...u32(items.length), ...items.flat()];
}

function name(text: string): number[] {
  const encoded = [...new TextEncoder().encode(text)];
  return [...u32(encoded.length), ...encoded];
}

function section(id: number, payload: number[]): number[] {
  return [id, ...u32(payload.length), ...payload];
}

function funcBody(localI32: number, code: number[]): number[] {
  const locals = localI32 > 0 ? [0x01, localI32, 0x7f] : [0x00];
  const inner = [...locals, ...code, 0x0b];
  return [...u32(inner.length), ...inner];
}

const TYPE_TIMER = 0;
const TYPE_MAP = 1;
const TYPE_SINK = 2;
const TYPE_PARK = 3;
const TYPE_STOPPED = 4;
const TYPE_VOID = 5;

const FN_NOW = 0;
const FN_HOST_SIN = 1;
const FN_PUSH = 2;
const FN_PARK = 3;
const FN_STOPPED = 4;
const FN_TIMER = 5;
const FN_QUANTIZER = 6;
const FN_SIN = 7;
const FN_SCOPE = 8;
const FN_TICK = 9;
const FN_RUN = 10;

function tickCode(stages: readonly ("sin" | "quantizer")[]): number[] {
  const code = [0xd2, ...u32(FN_TIMER), 0x14, ...u32(TYPE_TIMER)];
  for (const stage of stages) {
    const fn = stage === "quantizer" ? FN_QUANTIZER : FN_SIN;
    code.push(0xd2, ...u32(fn), 0x14, ...u32(TYPE_MAP));
  }
  code.push(0xd2, ...u32(FN_SCOPE), 0x14, ...u32(TYPE_SINK));
  return code;
}

/** Encode the XML block library as a wasm-gc + threads module. */
export function encodeLibrary(stages: readonly ("sin" | "quantizer")[], delayMs: number): Uint8Array {
  const delayNs = BigInt(Math.max(delayMs, 1)) * 1_000_000n;

  const types = section(
    1,
    vec([
      [0x60, 0x00, 0x01, 0x7c],
      [0x60, 0x01, 0x7c, 0x01, 0x7c],
      [0x60, 0x01, 0x7c, 0x00],
      [0x60, 0x01, 0x7e, 0x00],
      [0x60, 0x00, 0x01, 0x7f],
      [0x60, 0x00, 0x00],
    ]),
  );

  const imports = section(
    2,
    vec([
      [...name("env"), ...name("memory"), 0x02, 0x03, 0x01, 0x01],
      [...name("host"), ...name("now"), 0x00, TYPE_TIMER],
      [...name("host"), ...name("sin"), 0x00, TYPE_MAP],
    ]),
  );

  const functions = section(
    3,
    vec([
      [TYPE_SINK],
      [TYPE_PARK],
      [TYPE_STOPPED],
      [TYPE_TIMER],
      [TYPE_MAP],
      [TYPE_MAP],
      [TYPE_SINK],
      [TYPE_VOID],
      [TYPE_VOID],
    ]),
  );

  const exports = section(
    7,
    vec([
      [...name("timer"), 0x00, FN_TIMER],
      [...name("quantizer"), 0x00, FN_QUANTIZER],
      [...name("sin"), 0x00, FN_SIN],
      [...name("oscilloscope"), 0x00, FN_SCOPE],
      [...name("tick"), 0x00, FN_TICK],
      [...name("run"), 0x00, FN_RUN],
    ]),
  );

  const elems = section(9, [0x01, 0x03, 0x00, ...vec([[FN_TIMER], [FN_QUANTIZER], [FN_SIN], [FN_SCOPE]])]);

  const push = funcBody(1, [
    0x41, 0x04, 0x28, 0x02, 0x00, 0x21, 0x01,
    0x20, 0x01, 0x41, ...u32(SAMPLE_CAP), 0x70, 0x41, 0x08, 0x6c,
    0x20, 0x00,
    0x39, 0x03, 0x10,
    0x41, 0x04, 0x20, 0x01, 0x41, 0x01, 0x6a, 0x36, 0x02, 0x00,
  ]);

  const park = funcBody(0, [
    0x20, 0x00, 0x42, 0x00, 0x55,
    0x04, 0x40,
    0x41, 0x08, 0x41, 0x00, 0x20, 0x00, 0xfe, 0x01, 0x02, 0x00, 0x1a,
    0x0b,
  ]);

  const stopped = funcBody(0, [0x41, 0x00, 0xfe, 0x10, 0x02, 0x00]);
  const timer = funcBody(0, [0x10, FN_NOW]);
  const quantizer = funcBody(0, [0x20, 0x00]);
  const sin = funcBody(0, [0x20, 0x00, 0x10, FN_HOST_SIN]);
  const scope = funcBody(0, [0x20, 0x00, 0x10, FN_PUSH]);
  const tick = funcBody(0, tickCode(stages));
  const run = funcBody(0, [
    0x03, 0x40,
    0x10, FN_TICK,
    0x42, ...i64(delayNs),
    0x10, FN_PARK,
    0x10, FN_STOPPED,
    0x45,
    0x0d, 0x00,
    0x0b,
  ]);

  const code = section(10, vec([push, park, stopped, timer, quantizer, sin, scope, tick, run]));

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...types,
    ...imports,
    ...functions,
    ...exports,
    ...elems,
    ...code,
  ]);
}
