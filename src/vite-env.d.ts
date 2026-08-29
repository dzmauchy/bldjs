/// <reference types="vite/client" />

declare module "*.xml?raw" {
  const content: string;
  export default content;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare module "*.css?inline" {
  const css: string;
  export default css;
}

declare module "wabt" {
  interface WasmModule {
    resolveNames(): void;
    validate(): void;
    toBinary(options?: { write_debug_names?: boolean }): { buffer: Uint8Array; log: string };
    destroy(): void;
  }
  interface WabtModule {
    parseWat(filename: string, buffer: string | Uint8Array): WasmModule;
  }
  export default function loadWabt(): Promise<WabtModule>;
}
