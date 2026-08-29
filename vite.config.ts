import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const csp = "script-src 'self' 'wasm-unsafe-eval';";

/** Isolation headers required for SharedArrayBuffer + wasm threads / wait. */
const isolationHeaders = {
  "Content-Security-Policy": csp,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["binaryen"],
  },
  server: {
    port: 8080,
    host: true,
    headers: isolationHeaders,
  },
  preview: {
    port: 8080,
    host: true,
    headers: isolationHeaders,
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
  },
});
