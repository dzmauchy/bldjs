import binaryen from "binaryen";
import { BLOCK_SCRIPTS, RUNTIME_SCRIPTS } from "../../resources/binaryen";
import { CTX, SAMPLE_CAP } from "./memory";
import { CTX_PARAM, type WasmSignature } from "./signatures";

export type Stage = "sin" | "quantizer";

export { BLOCK_SCRIPTS };

export interface AssembleOptions {
  stages: readonly Stage[];
  delayMs: number;
}

export interface AssembledModule {
  wasm: Uint8Array;
  text: string;
}

const FEATURES =
  binaryen.Features.Atomics |
  binaryen.Features.ReferenceTypes |
  binaryen.Features.GC |
  binaryen.Features.BulkMemory |
  binaryen.Features.Multivalue;

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

function nameFuncType(module: binaryen.Module, seen: Set<binaryen.HeapType>, name: string, typeName: string): void {
  const fn = module.getFunction(name);
  const heap = binaryen.getHeapType(binaryen.getFunctionInfo(fn).type);
  if (seen.has(heap)) {
    return;
  }
  seen.add(heap);
  module.setTypeName(heap, typeName);
}

function funcRefType(module: binaryen.Module, name: string): binaryen.Type {
  const fn = module.getFunction(name);
  return binaryen.getTypeFromHeapType(binaryen.getHeapType(binaryen.getFunctionInfo(fn).type), false);
}

function callBlock(
  module: binaryen.Module,
  name: string,
  operands: readonly binaryen.ExpressionRef[],
  results: binaryen.Type,
): binaryen.ExpressionRef {
  return module.call_ref(module.ref.func(name, funcRefType(module, name)), [...operands], results);
}

function composeTick(module: binaryen.Module, stages: readonly Stage[]): binaryen.ExpressionRef {
  const ctx = (): binaryen.ExpressionRef => module.local.get(0, binaryen.i32);
  let expr = callBlock(module, "timer", [ctx()], binaryen.f64);
  for (const stage of stages) {
    expr = callBlock(module, stage, [ctx(), expr], binaryen.f64);
  }
  return callBlock(module, "oscilloscope", [ctx(), expr], binaryen.none);
}

function addTick(module: binaryen.Module, stages: readonly Stage[], delayNs: bigint): void {
  const fn = module.addFunction(
    "tick",
    binaryen.none,
    binaryen.none,
    [binaryen.i32],
    module.block(null, [
      module.local.set(0, module.i32.const(CTX)),
      module.f64.store(0, 8, module.local.get(0, binaryen.i32), module.call("now", [], binaryen.f64)),
      module.i64.store(8, 8, module.local.get(0, binaryen.i32), module.i64.const(delayNs)),
      composeTick(module, stages),
    ]),
  );
  binaryen.Function.setLocalName(fn, 0, "ctx");
  module.addFunctionExport("tick", "tick");
}

function addRun(module: binaryen.Module, delayNs: bigint): void {
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
}

/**
 * Assemble catalog block scripts, runtime helpers, and a tick/run composition
 * into one binaryen module, then emit wasm-gc + threads.
 */
export function assembleModule(options: AssembleOptions): AssembledModule {
  const delayNs = BigInt(Math.max(options.delayMs, 1)) * 1_000_000n;
  const module = new binaryen.Module();
  try {
    module.setFeatures(FEATURES as binaryen.Features);
    RUNTIME_SCRIPTS.imports(module);
    RUNTIME_SCRIPTS.push(module, SAMPLE_CAP);
    RUNTIME_SCRIPTS.park(module);
    RUNTIME_SCRIPTS.stopped(module);
    for (const add of Object.values(BLOCK_SCRIPTS)) {
      add(module);
    }

    const seen = new Set<binaryen.HeapType>();
    nameFuncType(module, seen, "now", "fn_now");
    nameFuncType(module, seen, "host_sin", "fn_host_sin");
    nameFuncType(module, seen, "push", "fn_push");
    nameFuncType(module, seen, "park", "fn_park");
    nameFuncType(module, seen, "stopped", "fn_stopped");
    for (const id of Object.keys(BLOCK_SCRIPTS)) {
      nameFuncType(module, seen, id, `fn_${id}`);
    }

    addTick(module, options.stages, delayNs);
    addRun(module, delayNs);
    nameFuncType(module, seen, "tick", "fn_void");

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

export function assembleWasm(options: AssembleOptions): Uint8Array {
  return assembleModule(options).wasm;
}

/** @deprecated Prefer {@link assembleModule}; emitText of the assembled module. */
export function assembleWat(options: AssembleOptions): string {
  return assembleModule(options).text;
}
