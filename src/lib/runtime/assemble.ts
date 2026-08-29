import { CTX, SAMPLE_CAP } from "./memory";
import { CTX_PARAM, type WasmSignature } from "./signatures";

export type Stage = "sin" | "quantizer";

export type { BlockScriptId } from "../../resources/binaryen";

export interface AssembleOptions {
  stages: readonly Stage[];
  delayMs: number;
}

export interface AssembledModule {
  wasm: Uint8Array;
  text: string;
}

type Binaryen = typeof import("binaryen").default;

function typeDecl(id: string, params: { name: string; type: string }[], results: { name: string; type: string }[]): string {
  const inner = [
    ...params.map((port) => `(param $${port.name} ${port.type})`),
    ...results.map((port) => `(result $${port.name} ${port.type})`),
  ].join(" ");
  return `  (type $${id} (func${inner ? ` ${inner}` : ""}))`;
}

/** Types whose names are referenced from block composition (`$fn_timer`, …). */
export function runtimeTypeWat(): string {
  return [
    typeDecl("fn_now", [], [{ name: "out", type: "f64" }]),
    typeDecl("fn_host_sin", [{ name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_push", [{ name: "v", type: "f64" }], []),
    typeDecl("fn_park", [{ name: "ns", type: "i64" }], []),
    typeDecl("fn_stopped", [], [{ name: "flag", type: "i32" }]),
    typeDecl("fn_void", [], []),
    typeDecl("fn_timer", [CTX_PARAM], [{ name: "out", type: "f64" }]),
    typeDecl("fn_quantizer", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_sin", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_oscilloscope", [CTX_PARAM, { name: "in", type: "f64" }], []),
  ].join("\n");
}

export function blockTypeWat(sig: WasmSignature): string {
  return typeDecl(`fn_${sig.id}`, [CTX_PARAM, ...sig.params], sig.results);
}

function nameFuncType(
  bin: Binaryen,
  module: InstanceType<Binaryen["Module"]>,
  seen: Set<number>,
  name: string,
  typeName: string,
): void {
  const fn = module.getFunction(name);
  const heap = bin.getHeapType(bin.getFunctionInfo(fn).type);
  if (seen.has(heap)) {
    return;
  }
  seen.add(heap);
  module.setTypeName(heap, typeName);
}

function funcRefType(bin: Binaryen, module: InstanceType<Binaryen["Module"]>, name: string): number {
  const fn = module.getFunction(name);
  return bin.getTypeFromHeapType(bin.getHeapType(bin.getFunctionInfo(fn).type), false);
}

function callBlock(
  bin: Binaryen,
  module: InstanceType<Binaryen["Module"]>,
  name: string,
  operands: readonly number[],
  results: number,
): number {
  return module.call_ref(module.ref.func(name, funcRefType(bin, module, name)), [...operands], results);
}

function composeTick(
  bin: Binaryen,
  module: InstanceType<Binaryen["Module"]>,
  stages: readonly Stage[],
): number {
  const ctx = (): number => module.local.get(0, bin.i32);
  let expr = callBlock(bin, module, "timer", [ctx()], bin.f64);
  for (const stage of stages) {
    expr = callBlock(bin, module, stage, [ctx(), expr], bin.f64);
  }
  return callBlock(bin, module, "oscilloscope", [ctx(), expr], bin.none);
}

/**
 * Assemble catalog block scripts, runtime helpers, and a tick/run composition
 * into one binaryen module, then emit wasm-gc + threads.
 *
 * binaryen.js is loaded on demand so the compiler is not in the first paint chunk.
 */
export async function assembleModule(options: AssembleOptions): Promise<AssembledModule> {
  const [{ default: binaryen }, { BLOCK_SCRIPTS, RUNTIME_SCRIPTS }, { nameLocals }] = await Promise.all([
    import("binaryen"),
    import("../../resources/binaryen"),
    import("../../resources/binaryen/util"),
  ]);
  const delayNs = BigInt(Math.max(options.delayMs, 1)) * 1_000_000n;
  const module = new binaryen.Module();
  try {
    module.setFeatures(
      binaryen.Features.Atomics |
        binaryen.Features.ReferenceTypes |
        binaryen.Features.GC |
        binaryen.Features.BulkMemory |
        binaryen.Features.Multivalue,
    );
    RUNTIME_SCRIPTS.imports(module);
    RUNTIME_SCRIPTS.push(module, SAMPLE_CAP);
    RUNTIME_SCRIPTS.park(module);
    RUNTIME_SCRIPTS.stopped(module);
    for (const add of Object.values(BLOCK_SCRIPTS)) {
      add(module);
    }

    const seen = new Set<number>();
    nameFuncType(binaryen, module, seen, "now", "fn_now");
    nameFuncType(binaryen, module, seen, "host_sin", "fn_host_sin");
    nameFuncType(binaryen, module, seen, "push", "fn_push");
    nameFuncType(binaryen, module, seen, "park", "fn_park");
    nameFuncType(binaryen, module, seen, "stopped", "fn_stopped");
    for (const id of Object.keys(BLOCK_SCRIPTS)) {
      nameFuncType(binaryen, module, seen, id, `fn_${id}`);
    }

    const tick = module.addFunction(
      "tick",
      binaryen.none,
      binaryen.none,
      [binaryen.i32],
      module.block(null, [
        module.local.set(0, module.i32.const(CTX)),
        module.f64.store(0, 8, module.local.get(0, binaryen.i32), module.call("now", [], binaryen.f64)),
        module.i64.store(8, 8, module.local.get(0, binaryen.i32), module.i64.const(delayNs)),
        composeTick(binaryen, module, options.stages),
      ]),
    );
    nameLocals(tick, ["ctx"]);
    module.addFunctionExport("tick", "tick");

    module.addFunction(
      "run",
      binaryen.none,
      binaryen.none,
      [],
      module.loop(
        "again",
        module.block(null, [
          module.call("tick", [], binaryen.none),
          module.call("park", [module.i64.const(delayNs)], binaryen.none),
          module.br("again", module.i32.eqz(module.call("stopped", [], binaryen.i32))),
        ]),
      ),
    );
    module.addFunctionExport("run", "run");
    nameFuncType(binaryen, module, seen, "tick", "fn_void");

    if (!module.validate()) {
      throw new Error("binaryen rejected the assembled generator module");
    }
    const text = module.emitText();
    if (!text.includes(`i32.const ${SAMPLE_CAP}`)) {
      throw new Error(`push script must use SAMPLE_CAP=${SAMPLE_CAP}`);
    }
    return { wasm: module.emitBinary().slice(), text };
  } finally {
    module.dispose();
  }
}

export async function assembleWasm(options: AssembleOptions): Promise<Uint8Array> {
  return (await assembleModule(options)).wasm;
}

/** @deprecated Prefer {@link assembleModule}; emitText of the assembled module. */
export async function assembleWat(options: AssembleOptions): Promise<string> {
  return (await assembleModule(options)).text;
}
