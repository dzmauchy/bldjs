import loadWabt from "wabt";

type WabtApi = Awaited<ReturnType<typeof loadWabt>>;

let loaded: Promise<WabtApi> | undefined;

export async function getWabt(): Promise<WabtApi> {
  loaded ??= loadWabt();
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
