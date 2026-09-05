import type { MoonbitFile } from "./types";

export type MoonbitTarget = "wasm-gc" | "wasm";

export const DEV_TARGET: MoonbitTarget = "wasm-gc";
export const PROD_TARGET: MoonbitTarget = "wasm";

export const DEV_EXPORTS = ["tick", "start"] as const;
export const PROD_EXPORTS = ["tick", "app_main"] as const;

type MooncApi = {
  buildPackage: (params: Record<string, unknown>) => { core?: Uint8Array; diagnostics: string[] };
  linkCore: (params: Record<string, unknown>) => { result: Uint8Array };
};

let mooncPreload: Promise<MooncApi> | undefined;
/** moonc-worker is process-global; queue compiles so pkg names and diagnostics stay isolated. */
let mooncQueue: Promise<unknown> = Promise.resolve();
let compileSeq = 0;

function asMoonc(mod: unknown): MooncApi {
  const rec = mod as { buildPackage?: unknown; linkCore?: unknown; default?: { buildPackage?: unknown; linkCore?: unknown } };
  const api = typeof rec.buildPackage === "function" ? rec : rec.default;
  if (typeof api?.buildPackage !== "function" || typeof api?.linkCore !== "function") {
    throw new Error("@moonbit/moonc-worker is missing buildPackage/linkCore");
  }
  return api as MooncApi;
}

/** Start loading the MoonBit compiler before the user presses Run. */
export function preloadMoonc(): Promise<MooncApi> {
  mooncPreload ??= import("@moonbit/moonc-worker").then(asMoonc);
  return mooncPreload;
}

function isErrorDiagnostic(line: string): boolean {
  return /\[E\d+\]/.test(line) && !/Warning/i.test(line);
}

function formatDiagnostics(diagnostics: string[]): string {
  return diagnostics.map((line) => line.trimEnd()).join("\n");
}

function ownDiagnostics(diagnostics: string[], pkg: string): string[] {
  const prefix = `${pkg}:`;
  return diagnostics.filter((line) => line.startsWith(prefix));
}

function mbtFiles(source: string | readonly MoonbitFile[]): [string, string][] {
  if (typeof source === "string") {
    return [["main.mbt", source]];
  }
  return source.map(([name, text]) => [name, text]);
}

export interface CompileMoonbitOptions {
  /** `wasm-gc` for the browser; linear `wasm` for MCU/WAMR. */
  target?: MoonbitTarget;
  exportedFunctions?: readonly string[];
}

function defaultExports(target: MoonbitTarget): readonly string[] {
  return target === "wasm" ? PROD_EXPORTS : DEV_EXPORTS;
}

function enqueueMoonc<T>(fn: () => Promise<T>): Promise<T> {
  const run = mooncQueue.then(fn, fn);
  mooncQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function nextPkg(target: MoonbitTarget): string {
  compileSeq += 1;
  return target === "wasm" ? `prod_${compileSeq}` : `dev_${compileSeq}`;
}

/** Compile generated MoonBit to a WASM module in the browser (or Node). */
export async function compileMoonbit(
  source: string | readonly MoonbitFile[],
  options: CompileMoonbitOptions = {},
): Promise<Uint8Array> {
  const target = options.target ?? DEV_TARGET;
  const exportedFunctions = [...(options.exportedFunctions ?? defaultExports(target))];
  return enqueueMoonc(async () => {
    const moonc = await preloadMoonc();
    const pkg = nextPkg(target);
    const pkgSources = [`${pkg}:${pkg}:/`];
    const files = mbtFiles(source);
    const build = moonc.buildPackage({
      mbtFiles: files,
      miFiles: [],
      indirectImportMiFiles: [],
      stdMiFiles: [],
      target,
      pkg,
      pkgSources,
      isMain: false,
      errorFormat: "human",
      enableValueTracing: false,
      noOpt: false,
    });
    const diagnostics = ownDiagnostics(build.diagnostics ?? [], pkg);
    const errors = diagnostics.filter(isErrorDiagnostic);
    if (errors.length > 0 || !build.core) {
      throw new Error(`MoonBit ${target} compile failed:\n${formatDiagnostics(diagnostics.length > 0 ? diagnostics : (build.diagnostics ?? errors))}`);
    }
    const linked = moonc.linkCore({
      coreFiles: [build.core],
      main: pkg,
      pkgSources,
      target,
      exportedFunctions,
      outputFormat: "wasm",
      testMode: false,
      debug: false,
      noOpt: false,
      sourceMap: false,
      sources: {},
      stopOnMain: false,
    });
    return linked.result;
  });
}
