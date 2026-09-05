import type { MoonbitFile } from "./types";

type MooncApi = {
  buildPackage: (params: Record<string, unknown>) => { core?: Uint8Array; diagnostics: string[] };
  linkCore: (params: Record<string, unknown>) => { result: Uint8Array };
};

let mooncPreload: Promise<MooncApi> | undefined;

function asMoonc(mod: unknown): MooncApi {
  const rec = mod as { buildPackage?: unknown; linkCore?: unknown; default?: { buildPackage?: unknown; linkCore?: unknown } };
  const api = typeof rec.buildPackage === "function" ? rec : rec.default;
  if (typeof api?.buildPackage !== "function" || typeof api?.linkCore !== "function") {
    throw new Error("@moonbit/moonc-worker is missing buildPackage/linkCore");
  }
  return api as MooncApi;
}

/** Start loading the MoonBit wasm-gc compiler before the user presses Run. */
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

function mbtFiles(source: string | readonly MoonbitFile[]): [string, string][] {
  if (typeof source === "string") {
    return [["main.mbt", source]];
  }
  return source.map(([name, text]) => [name, text]);
}

/** Compile generated MoonBit to a wasm-gc module in the browser (or Node). */
export async function compileMoonbit(source: string | readonly MoonbitFile[]): Promise<Uint8Array> {
  const moonc = await preloadMoonc();
  const files = mbtFiles(source);
  const build = moonc.buildPackage({
    mbtFiles: files,
    miFiles: [],
    indirectImportMiFiles: [],
    stdMiFiles: [],
    target: "wasm-gc",
    pkg: "main",
    pkgSources: ["main:main:/"],
    isMain: false,
    errorFormat: "human",
    enableValueTracing: false,
    noOpt: false,
  });
  const errors = (build.diagnostics ?? []).filter(isErrorDiagnostic);
  if (errors.length > 0 || !build.core) {
    throw new Error(`MoonBit wasm-gc compile failed:\n${formatDiagnostics(build.diagnostics ?? errors)}`);
  }
  const linked = moonc.linkCore({
    coreFiles: [build.core],
    main: "main",
    pkgSources: ["main:main:/"],
    target: "wasm-gc",
    exportedFunctions: ["tick", "start"],
    outputFormat: "wasm",
    testMode: false,
    debug: false,
    noOpt: false,
    sourceMap: false,
    sources: {},
    stopOnMain: false,
  });
  return linked.result;
}
