import { CTX, SAMPLE_CAP } from "./memory";
import { CTX_PARAM, type WasmSignature } from "./signatures";

export type Stage = "sin" | "cos" | "quantizer";

export type TickSink =
  | { kind: "scope" }
  | { kind: "sin"; then: TickSink }
  | { kind: "cos"; then: TickSink }
  | { kind: "quantizer"; then: TickSink }
  | { kind: "fork"; d1: TickSink; d2: TickSink };

export type { BlockScriptId } from "./binaryen";

export interface AssembleOptions {
  stages?: readonly Stage[];
  sink?: TickSink;
  delayMs: number;
}

export interface AssembledModule {
  wasm: Uint8Array;
  text: string;
}

type Binaryen = typeof import("binaryen").default;

export function stagesToSink(stages: readonly Stage[]): TickSink {
  let sink: TickSink = { kind: "scope" };
  for (const stage of [...stages].reverse()) {
    sink = { kind: stage, then: sink };
  }
  return sink;
}

export function countForks(sink: TickSink): number {
  switch (sink.kind) {
    case "scope":
      return 0;
    case "fork":
      return 1 + countForks(sink.d1) + countForks(sink.d2);
    default:
      return countForks(sink.then);
  }
}

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
    typeDecl("fn_host_cos", [{ name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_push", [{ name: "v", type: "f64" }], []),
    typeDecl("fn_park", [{ name: "ns", type: "i64" }], []),
    typeDecl("fn_stopped", [], [{ name: "flag", type: "i32" }]),
    typeDecl("fn_void", [], []),
    typeDecl("fn_timer", [CTX_PARAM], [{ name: "out", type: "f64" }]),
    typeDecl("fn_quantizer", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_sin", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_cos", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_fork", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
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
  sink: TickSink,
): number {
  const ctx = (): number => module.local.get(0, bin.i32);
  const stmts: number[] = [];
  let nextLocal = 1;

  const apply = (node: TickSink, value: number): void => {
    switch (node.kind) {
      case "scope":
        stmts.push(callBlock(bin, module, "oscilloscope", [ctx(), value], bin.none));
        return;
      case "quantizer":
      case "sin":
      case "cos":
        apply(node.then, callBlock(bin, module, node.kind, [ctx(), value], bin.f64));
        return;
      case "fork": {
        const tee = callBlock(bin, module, "fork", [ctx(), value], bin.f64);
        const local = nextLocal;
        nextLocal += 1;
        stmts.push(module.local.set(local, tee));
        apply(node.d1, module.local.get(local, bin.f64));
        apply(node.d2, module.local.get(local, bin.f64));
      }
    }
  };

  apply(sink, callBlock(bin, module, "timer", [ctx()], bin.f64));
  return module.block(null, stmts, bin.none);
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
    import("./binaryen"),
    import("./binaryen/util"),
  ]);
  const sink = options.sink ?? stagesToSink(options.stages ?? []);
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
    nameFuncType(binaryen, module, seen, "host_cos", "fn_host_cos");
    nameFuncType(binaryen, module, seen, "push", "fn_push");
    nameFuncType(binaryen, module, seen, "park", "fn_park");
    nameFuncType(binaryen, module, seen, "stopped", "fn_stopped");
    for (const id of Object.keys(BLOCK_SCRIPTS)) {
      nameFuncType(binaryen, module, seen, id, `fn_${id}`);
    }

    const teeCount = countForks(sink);
    const extraLocals = Array.from({ length: teeCount }, () => binaryen.f64);
    const tick = module.addFunction(
      "tick",
      binaryen.none,
      binaryen.none,
      [binaryen.i32, ...extraLocals],
      module.block(null, [
        module.local.set(0, module.i32.const(CTX)),
        module.f64.store(0, 8, module.local.get(0, binaryen.i32), module.call("now", [], binaryen.f64)),
        module.i64.store(8, 8, module.local.get(0, binaryen.i32), module.i64.const(delayNs)),
        composeTick(binaryen, module, sink),
      ]),
    );
    nameLocals(tick, ["ctx", ...Array.from({ length: teeCount }, (_, index) => `t${index}`)]);
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
