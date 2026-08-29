export const SAMPLE_CAP = 480;

export interface HostImports {
  host: {
    now: () => number;
    sin: (value: number) => number;
    park: () => void;
    push: (value: number) => void;
  };
}

/** Imports shared by the generator worker and the in-process runner. */
export function createHost(buffer: number[], now: () => number = () => Date.now() / 1000): HostImports {
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
