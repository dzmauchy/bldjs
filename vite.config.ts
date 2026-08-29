import { createReadStream, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const csp = "script-src 'self' 'wasm-unsafe-eval';";

/** Isolation headers required for SharedArrayBuffer + wasm threads / wait. */
const isolationHeaders = {
  "Content-Security-Policy": csp,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const libavoidWasm = fileURLToPath(new URL("./node_modules/libavoid-js/dist/libavoid.wasm", import.meta.url));

function serveLibavoidWasm(): Plugin {
  return {
    name: "libavoid-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/assets/libavoid.wasm") {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/wasm");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        createReadStream(libavoidWasm).pipe(res);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "assets/libavoid.wasm",
        source: readFileSync(libavoidWasm),
      });
    },
  };
}

export default defineConfig({
  plugins: [serveLibavoidWasm()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
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
  optimizeDeps: {
    exclude: ["libavoid-js", "@joint/router-avoid"],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
  },
});
