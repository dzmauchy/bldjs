import { createReadStream, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import solid from "vite-plugin-solid";
import { defineConfig, type Plugin } from "vitest/config";

const csp = "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:;";

/** Isolation headers required for SharedArrayBuffer / wasm worker threads. */
const isolationHeaders = {
  "Content-Security-Policy": csp,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function applyIsolation(headers: { setHeader: (name: string, value: string) => void }): void {
  for (const [name, value] of Object.entries(isolationHeaders)) {
    headers.setHeader(name, value);
  }
}

/** Set COOP/COEP/CORP on every response, including WASM and worker modules. */
function crossOriginIsolation(): Plugin {
  const middleware = (
    _req: unknown,
    res: { setHeader: (name: string, value: string) => void },
    next: () => void,
  ) => {
    applyIsolation(res);
    next();
  };
  return {
    name: "cross-origin-isolation",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: `/*\n${Object.entries(isolationHeaders)
          .map(([name, value]) => `  ${name}: ${value}`)
          .join("\n")}\n`,
      });
    },
  };
}

const libavoidWasm = fileURLToPath(
  new URL("../../node_modules/libavoid-js/dist/libavoid.wasm", import.meta.url),
);

function serveLibavoidWasm(): Plugin {
  const middleware = (
    req: { url?: string },
    res: { setHeader: (name: string, value: string) => void },
    next: () => void,
  ) => {
    if (req.url?.split("?")[0] !== "/assets/libavoid.wasm") {
      next();
      return;
    }
    res.setHeader("Content-Type", "application/wasm");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    createReadStream(libavoidWasm).pipe(res as unknown as NodeJS.WritableStream);
  };
  return {
    name: "libavoid-wasm",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
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

const esbuildWasm = fileURLToPath(
  new URL("../../node_modules/esbuild-wasm/esbuild.wasm", import.meta.url),
);

function serveEsbuildWasm(): Plugin {
  const middleware = (
    req: { url?: string },
    res: { setHeader: (name: string, value: string) => void },
    next: () => void,
  ) => {
    if (req.url?.split("?")[0] !== "/assets/esbuild.wasm") {
      next();
      return;
    }
    res.setHeader("Content-Type", "application/wasm");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    createReadStream(esbuildWasm).pipe(res as unknown as NodeJS.WritableStream);
  };
  return {
    name: "esbuild-wasm",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "assets/esbuild.wasm",
        source: readFileSync(esbuildWasm),
      });
    },
  };
}

export default defineConfig({
  plugins: [solid(), crossOriginIsolation(), serveLibavoidWasm(), serveEsbuildWasm()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
      constants: "constants-browserify",
    },
  },
  optimizeDeps: {
    exclude: ["libavoid-js", "@joint/router-avoid", "@bld/model"],
  },
    server: {
      port: 8080,
      host: true,
      headers: isolationHeaders,
      fs: {
        allow: [fileURLToPath(new URL("../..", import.meta.url))],
      },
    },
    preview: {
      port: 8080,
      host: true,
      headers: isolationHeaders,
    },
    build: {
      outDir: "../../dist",
      emptyOutDir: true,
    },
    worker: {
      format: "es",
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.ts"],
      setupFiles: ["src/test-setup.ts"],
    },
  },
);
