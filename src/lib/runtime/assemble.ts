import { CTX, SAMPLE_CAP } from "./memory";
import { CTX_PARAM, type WasmSignature } from "./signatures";

export type Stage = "sin" | "cos" | "quantizer";

export type { BlockScriptId } from "../../resources/binaryen";

/** First-order compose tree. `scope.index` selects which ring `push_at` writes. */
export type ComposeTree =
  | { kind: "scope"; index: number }
  | { kind: "stage"; stage: Stage; inner: ComposeTree }
  | { kind: "fork"; inner: ComposeTree[] };

export interface AssembleOptions {
  stages: readonly Stage[];
  delayMs: number;
  tree?: ComposeTree;
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
    typeDecl("fn_host_cos", [{ name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_push", [{ name: "v", type: "f64" }], []),
    typeDecl("fn_push_at", [{ name: "v", type: "f64" }, { name: "buf", type: "i32" }], []),
    typeDecl("fn_park", [{ name: "ns", type: "i64" }], []),
    typeDecl("fn_stopped", [], [{ name: "flag", type: "i32" }]),
    typeDecl("fn_void", [], []),
    typeDecl("fn_timer", [CTX_PARAM], [{ name: "out", type: "f64" }]),
    typeDecl("fn_quantizer", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_sin", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_cos", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
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

function linearTree(stages: readonly Stage[]): ComposeTree {
  let node: ComposeTree = { kind: "scope", index: 0 };
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    node = { kind: "stage", stage: stages[i], inner: node };
  }
  return node;
}

function countStages(tree: ComposeTree): number {
  if (tree.kind === "stage") {
    return 1 + countStages(tree.inner);
  }
  if (tree.kind === "fork") {
    return tree.inner.reduce((sum, child) => sum + countStages(child), 0);
  }
  return 0;
}

function composeTree(
  bin: Binaryen,
  module: InstanceType<Binaryen["Module"]>,
  tree: ComposeTree,
  value: number,
  nextLocal: { n: number },
): number {
  const ctx = (): number => module.local.get(0, bin.i32);
  if (tree.kind === "scope") {
    if (tree.index <= 0) {
      return callBlock(bin, module, "oscilloscope", [ctx(), value], bin.none);
    }
    return module.call("push_at", [value, module.i32.const(tree.index)], bin.none);
  }
  if (tree.kind === "stage") {
    nextLocal.n += 1;
    const slot = nextLocal.n;
    return module.block(
      null,
      [
        module.local.set(slot, callBlock(bin, module, tree.stage, [ctx(), value], bin.f64)),
        composeTree(bin, module, tree.inner, module.local.get(slot, bin.f64), nextLocal),
      ],
      bin.none,
    );
  }
  return module.block(
    null,
    tree.inner.map((child) => composeTree(bin, module, child, value, nextLocal)),
    bin.none,
  );
}

function composeTick(
  bin: Binaryen,
  module: InstanceType<Binaryen["Module"]>,
  tree: ComposeTree,
): number {
  const nextLocal = { n: 1 };
  return module.block(
    null,
    [
      module.local.set(1, callBlock(bin, module, "timer", [module.local.get(0, bin.i32)], bin.f64)),
      composeTree(bin, module, tree, module.local.get(1, bin.f64), nextLocal),
    ],
    bin.none,
  );
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
    nameFuncType(binaryen, module, seen, "host_cos", "fn_host_cos");
    nameFuncType(binaryen, module, seen, "push", "fn_push");
    nameFuncType(binaryen, module, seen, "push_at", "fn_push_at");
    nameFuncType(binaryen, module, seen, "park", "fn_park");
    nameFuncType(binaryen, module, seen, "stopped", "fn_stopped");
    for (const id of Object.keys(BLOCK_SCRIPTS)) {
      nameFuncType(binaryen, module, seen, id, `fn_${id}`);
    }

    const tree = options.tree ?? linearTree(options.stages);
    const f64Locals = 1 + countStages(tree);
    const tick = module.addFunction(
      "tick",
      binaryen.none,
      binaryen.none,
      [binaryen.i32, ...Array.from({ length: f64Locals }, () => binaryen.f64)],
      module.block(null, [
        module.local.set(0, module.i32.const(CTX)),
        module.f64.store(0, 8, module.local.get(0, binaryen.i32), module.call("now", [], binaryen.f64)),
        module.i64.store(8, 8, module.local.get(0, binaryen.i32), module.i64.const(delayNs)),
        composeTick(binaryen, module, tree),
      ]),
    );
    nameLocals(tick, ["ctx", ...Array.from({ length: f64Locals }, (_, i) => (i === 0 ? "v" : `v${i}`))]);
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
