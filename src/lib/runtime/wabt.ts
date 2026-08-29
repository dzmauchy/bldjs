import * as wabtModule from "wabt";

interface WasmModule {
  resolveNames(): void;
  validate(): void;
  toBinary(options?: { write_debug_names?: boolean }): { buffer: Uint8Array; log: string };
  destroy(): void;
}

export interface WabtApi {
  parseWat(filename: string, buffer: string | Uint8Array): WasmModule;
}

type WabtLoader = () => Promise<WabtApi>;

function asLoader(value: unknown): WabtLoader | undefined {
  return typeof value === "function" ? (value as WabtLoader) : undefined;
}

/** wabt is CJS (`module.exports = fn`). Vite/Node may surface that as `default` or the namespace itself. */
export function wabtLoader(): WabtLoader {
  const fromDefault = asLoader((wabtModule as { default?: unknown }).default);
  if (fromDefault) {
    return fromDefault;
  }
  const fromNamespace = asLoader(wabtModule);
  if (fromNamespace) {
    return fromNamespace;
  }
  throw new Error("wabt module did not export a loader");
}

let loaded: Promise<WabtApi> | undefined;

export async function getWabt(): Promise<WabtApi> {
  loaded ??= wabtLoader()();
  return loaded;
}

/** Compile WASM text to a binary module with wabt (`wat2wasm`). */
export async function wat2wasm(wat: string, filename = "generator.wat"): Promise<Uint8Array> {
  const wabt = await getWabt();
  const parsed = wabt.parseWat(filename, wat);
  try {
    parsed.resolveNames();
    parsed.validate();
    const { buffer } = parsed.toBinary({ write_debug_names: true });
    return buffer;
  } finally {
    parsed.destroy();
  }
}
