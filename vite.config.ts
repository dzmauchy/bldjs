import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const csp = "script-src 'self' 'wasm-unsafe-eval';";

export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  server: {
    port: 8080,
    host: true,
    headers: {
      "Content-Security-Policy": csp,
    },
  },
  preview: {
    port: 8080,
    host: true,
    headers: {
      "Content-Security-Policy": csp,
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["wabt"],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
    server: {
      deps: {
        inline: ["wabt"],
      },
    },
  },
});
