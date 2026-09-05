type MooncApi = {
  buildPackage: (params: Record<string, unknown>) => { core?: Uint8Array; diagnostics: string[] };
  linkCore: (params: Record<string, unknown>) => { result: Uint8Array };
};

let mooncPreload: Promise<MooncApi> | undefined;

function asMoonc(mod: unknown): MooncApi {
  const rec = mod as MooncApi & { default?: MooncApi };
  const api = rec.buildPackage ? rec : rec.default;
  if (!api?.buildPackage || !api.linkCore) {
    throw new Error("@moonbit/moonc-worker is missing buildPackage/linkCore");
  }
  return api;
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

/** Compile generated MoonBit to a wasm-gc module in the browser (or Node). */
export async function compileMoonbit(source: string): Promise<Uint8Array> {
  const moonc = await preloadMoonc();
  const build = moonc.buildPackage({
    mbtFiles: [["main.mbt", source]],
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
