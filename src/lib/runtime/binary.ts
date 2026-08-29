/** Unsigned LEB128. */
export function u32(value: number): number[] {
  const out: number[] = [];
  let n = value >>> 0;
  do {
    const byte = n & 0x7f;
    n >>>= 7;
    out.push(n ? byte | 0x80 : byte);
  } while (n);
  return out;
}

/** Signed LEB128 (i32). */
export function s32(value: number): number[] {
  const out: number[] = [];
  let n = value | 0;
  while (true) {
    const byte = n & 0x7f;
    n >>= 7;
    const done = (n === 0 && (byte & 0x40) === 0) || (n === -1 && (byte & 0x40) !== 0);
    out.push(done ? byte : byte | 0x80);
    if (done) {
      break;
    }
  }
  return out;
}

/** Signed LEB128 (i64). */
export function s64(value: bigint): number[] {
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

export function f32(value: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return [...new Uint8Array(view.buffer)];
}

export function f64(value: number): number[] {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return [...new Uint8Array(view.buffer)];
}

export function vec(items: number[][]): number[] {
  return [...u32(items.length), ...items.flat()];
}

export function name(text: string): number[] {
  const encoded = [...new TextEncoder().encode(text)];
  return [...u32(encoded.length), ...encoded];
}

export function section(id: number, payload: number[]): number[] {
  return [id, ...u32(payload.length), ...payload];
}

export const VALTYPE: Record<string, number> = {
  i32: 0x7f,
  i64: 0x7e,
  f32: 0x7d,
  f64: 0x7c,
  v128: 0x7b,
  funcref: 0x70,
  externref: 0x6f,
};
