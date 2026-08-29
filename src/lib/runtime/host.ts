export const SAMPLE_CAP = 480;

/** Imports shared by the generator worker and the in-process runner. */
export function createHost(
  buffer: number[],
  now: () => number = () => Date.now() / 1000,
): WebAssembly.Imports {
  return {
    host: {
      now,
      sin: Math.sin,
      park: () => {},
      push: (value: number) => {
        if (buffer.length >= SAMPLE_CAP) {
          buffer.shift();
        }
        buffer.push(value);
      },
    },
  };
}

export function copyWasmBuffer(wasm: Uint8Array): ArrayBuffer {
  return wasm.slice().buffer;
}
