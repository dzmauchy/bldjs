import * as esbuild from "esbuild-wasm";
import { desugarFunctionDecorators } from "./desugar";
import { LIBRARY_TS, MODEL_TS } from "../blocks/builtin";

export interface CompileSources {
  library?: string;
  model?: string;
  diagram: string;
}

let esbuildInitPromise: Promise<void> | null = null;

function runningOnNode(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return Boolean(proc?.versions?.node);
}

export async function ensureEsbuildInitialized(): Promise<void> {
  if (esbuildInitPromise) {
    return esbuildInitPromise;
  }
  esbuildInitPromise = (async () => {
    if (!runningOnNode()) {
      await esbuild.initialize({
        wasmURL: "/assets/esbuild.wasm",
        worker: false,
      });
    }
  })();
  return esbuildInitPromise;
}

export function combineSources(
  source: string | CompileSources,
  options?: { library?: string; model?: string },
): string {
  const library =
    typeof source === "object" ? source.library ?? LIBRARY_TS : options?.library ?? LIBRARY_TS;
  const model =
    typeof source === "object" ? source.model ?? MODEL_TS : options?.model ?? MODEL_TS;
  const diagram = typeof source === "object" ? source.diagram : source;

  if (diagram.includes("@Catalog({ id: \"cs\"") && diagram.includes("overshootFromValue")) {
    return diagram;
  }
  if (diagram.includes("@Catalog({ id: \"cs\"")) {
    return `${diagram}\n\n${library}`;
  }
  return `${model.replace(/\s+$/, "")}\n\n${library.replace(/\s+$/, "")}\n\n${diagram.trimStart()}`;
}

/** Transpile TypeScript diagram source to JavaScript using esbuild-wasm. */
export function compileTypeScript(
  source: string | CompileSources,
  options?: { library?: string; model?: string },
): string {
  const combined = combineSources(source, options);
  const desugared = desugarFunctionDecorators(combined);
  const result = esbuild.transformSync(desugared, {
    loader: "ts",
    format: "cjs",
    target: "es2025",
  });
  return result.code;
}

export async function compileTypeScriptAsync(source: string | CompileSources): Promise<string> {
  await ensureEsbuildInitialized();
  const combined = combineSources(source);
  const desugared = desugarFunctionDecorators(combined);
  const result = await esbuild.transform(desugared, {
    loader: "ts",
    format: "cjs",
    target: "es2025",
  });
  return result.code;
}

export async function preloadTsc(): Promise<void> {
  await ensureEsbuildInitialized();
}
