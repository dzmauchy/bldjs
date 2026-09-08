import { createReadStream, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { build as bundle } from "rolldown";
import solid from "vite-plugin-solid";
import { defineConfig, type Plugin } from "vitest/config";

const csp = "script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:;";

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

const stubNativeTsc = !process.env.VITEST;
const tscStubSync = fileURLToPath(new URL("../model/src/tsc/stub-sync.ts", import.meta.url));
const tscStubFs = fileURLToPath(new URL("../model/src/tsc/stub-fs.ts", import.meta.url));
const catalogPluginSource = fileURLToPath(new URL("../model/src/tsc/plugin.ts", import.meta.url));
const catalogPluginBundle = fileURLToPath(
  new URL("../../node_modules/.cache/bld-catalog-plugin.mjs", import.meta.url),
);

/** Bundle the TypeScript 7.0.2 extractor so Vite config loading does not Node-strip `@bld/types/ast`. */
async function loadCatalogPlugin(): Promise<() => Plugin> {
  mkdirSync(dirname(catalogPluginBundle), { recursive: true });
  await bundle({
    input: catalogPluginSource,
    platform: "node",
    external: [/^typescript(\/|$)/, /^node:/, "vite"],
    output: {
      file: catalogPluginBundle,
      format: "es",
    },
  });
  const loaded = (await import(pathToFileURL(catalogPluginBundle).href)) as {
    bldCatalogPlugin: () => Plugin;
  };
  return loaded.bldCatalogPlugin;
}

export default defineConfig(async () => {
  const bldCatalogPlugin = await loadCatalogPlugin();
  return {
    plugins: [solid(), bldCatalogPlugin(), crossOriginIsolation(), serveLibavoidWasm()],
    resolve: {
      alias: {
        $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
        constants: "constants-browserify",
        ...(stubNativeTsc
          ? {
              "typescript/unstable/sync": tscStubSync,
              "typescript/unstable/fs": tscStubFs,
            }
          : {}),
      },
    },
    optimizeDeps: {
      exclude: ["libavoid-js", "@joint/router-avoid", "@bld/model", "typescript"],
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
  };
});
