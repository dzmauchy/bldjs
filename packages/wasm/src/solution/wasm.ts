import type { BlockDef } from "@bld/xml";
import {
  Catalog,
  Diagram,
  DEFAULT_PERIOD_MS,
  SolutionView,
  associateBuiltinModels,
  catalogPortName,
  isArrayType,
  isGeneratorId,
  portSlotIndex,
  type SolutionAssembly,
  type SolutionBuilder,
  type SolutionViewBlock,
  type SolutionViewConnector,
} from "@bld/xml";
import { canShareMemory } from "../isolation";
import { CTX, MEM, SAMPLE_CAP } from "../runtime/memory";

export interface WasmBuildOptions {
  delayMs?: number;
  generatorId?: number;
  /** @deprecated Use {@link generatorId}. */
  timerId?: number;
  /** Shared memory + atomics. Off when the page is not cross-origin isolated. */
  sharedMemory?: boolean;
  /** WAT text is expensive; skip it on the Run hot path. */
  emitText?: boolean;
}

let assemblerPreload: Promise<unknown> | undefined;

/**
 * Start loading binaryen.js before the user presses Run.
 * Callers must keep this a dynamic import: a static import of binaryen or
 * `../binaryen` from the public package entry puts 15MB on first paint.
 */
export function preloadAssembler(): void {
  assemblerPreload ??= Promise.all([
    import("binaryen"),
    import("../binaryen"),
    import("../binaryen/util"),
  ]);
}

function builtinCatalog(): Catalog {
  const diagram = new Diagram("solution", "Solution");
  associateBuiltinModels(diagram);
  return diagram.catalog();
}

function viewFromGenerator(generator = "timer"): SolutionView {
  const generatorId = isGeneratorId(generator) ? generator : "timer";
  return new SolutionView(
    [
      { id: 1, defId: "scope" },
      { id: 2, defId: generatorId },
    ],
    [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
  );
}

/**
 * Assign a sample ring to each scope vector slot, walking incoming wires from the generator
 * (same order the UI uses for scope plot series).
 */
export function assignRings(view: SolutionView, generatorId: number): Map<string, number> {
  const rings = new Map<string, number>();
  const walk = (id: number, depth: number): void => {
    if (depth > 64) {
      return;
    }
    for (const link of view.incoming(id, "in")) {
      const fromDef = view.defId(link.fromBlock);
      if (fromDef === "scope") {
        const key = `${link.fromBlock}:${portSlotIndex(link.fromOut)}`;
        if (!rings.has(key)) {
          rings.set(key, rings.size);
        }
      } else if (fromDef) {
        walk(link.fromBlock, depth + 1);
      }
    }
  };
  walk(generatorId, 0);
  return rings;
}

function topoBlocks(view: SolutionView, catalog: Catalog): SolutionViewBlock[] {
  const remaining = new Map(view.blocks.map((block) => [block.id, block]));
  const ready: SolutionViewBlock[] = [];
  const emitted = new Set<number>();
  const depsOf = (block: SolutionViewBlock): number[] => {
    const def = catalog.block(block.defId);
    if (!def) {
      return [];
    }
    const deps = new Set<number>();
    for (const port of def.inputs) {
      for (const link of view.incoming(block.id, port.name)) {
        deps.add(link.fromBlock);
      }
    }
    return [...deps];
  };
  while (remaining.size > 0) {
    let progress = false;
    for (const [id, block] of remaining) {
      if (depsOf(block).every((dep) => emitted.has(dep) || !remaining.has(dep))) {
        ready.push(block);
        remaining.delete(id);
        emitted.add(id);
        progress = true;
      }
    }
    if (!progress) {
      ready.push(...remaining.values());
      break;
    }
  }
  return ready;
}

/**
 * WASM SolutionBuilder: one XML-matching builder block per SolutionViewBlock,
 * then SolutionViewConnectors to wire the module (array.get, fork, call).
 */
export class WasmSolutionBuilder implements SolutionBuilder {
  constructor(private readonly catalog: Catalog = builtinCatalog()) {}

  async build(view: SolutionView, options: WasmBuildOptions = {}): Promise<SolutionAssembly> {
    const generatorId = options.generatorId ?? options.timerId ?? view.firstGeneratorId();
    const graph = generatorId === undefined ? view : view.subgraphFromGenerator(generatorId);
    const delayMs = options.delayMs ?? DEFAULT_PERIOD_MS;
    return emitWasm(this.catalog, graph, {
      delayMs,
      generatorId,
      sharedMemory: options.sharedMemory ?? canShareMemory(),
      emitText: options.emitText,
    });
  }
}

async function emitWasm(
  catalog: Catalog,
  view: SolutionView,
  options: { delayMs: number; generatorId?: number; sharedMemory: boolean; emitText?: boolean },
): Promise<SolutionAssembly> {
  preloadAssembler();
  const [{ default: binaryen }, scripts, { nameLocals }] = await Promise.all([
    import("binaryen"),
    import("../binaryen"),
    import("../binaryen/util"),
  ]);
  const { BLOCK_SCRIPTS, RUNTIME_SCRIPTS, addCatalogTypes, wasmFeatures, nopConsumer, addFork } = scripts;
  const delayNs = BigInt(Math.max(options.delayMs, 1)) * 1_000_000n;
  const module = new binaryen.Module();
  try {
    module.setFeatures(wasmFeatures(binaryen));
    const types = addCatalogTypes(binaryen, module);
    RUNTIME_SCRIPTS.imports(module, options.sharedMemory);
    RUNTIME_SCRIPTS.push(module, SAMPLE_CAP);
    RUNTIME_SCRIPTS.failTag(module);
    if (options.sharedMemory) {
      RUNTIME_SCRIPTS.stopped(module);
      RUNTIME_SCRIPTS.wait(module);
      RUNTIME_SCRIPTS.notify(module);
    }

    const rings = options.generatorId !== undefined ? assignRings(view, options.generatorId) : new Map<string, number>();
    const names = new Map<number, string>();
    for (const block of view.blocks) {
      const add = BLOCK_SCRIPTS[block.defId];
      if (!add) {
        continue;
      }
      const name = view.instanceName(block);
      names.set(block.id, name);
      const def = catalog.block(block.defId);
      const arrayOut = def?.outputs.find((port) => isArrayType(port.ty));
      const emit = { name, sharedMemory: options.sharedMemory };
      if (arrayOut) {
        const outgoing = view.outgoing(block.id, arrayOut.name);
        const length = Math.max(outgoing.length, 1);
        const slotRings = Array.from({ length }, (_, slot) => {
          const link = outgoing[slot];
          if (!link) {
            return slot;
          }
          return rings.get(`${block.id}:${portSlotIndex(link.fromOut)}`) ?? slot;
        });
        add(module, types, { ...emit, length, rings: slotRings });
      } else {
        add(module, types, emit);
      }
    }

    const forkNames = new Map<string, string>();
    for (const block of view.blocks) {
      const def = catalog.block(block.defId);
      if (!def) {
        continue;
      }
      for (const port of def.inputs) {
        const incoming = view.incoming(block.id, port.name);
        if (incoming.length <= 1) {
          continue;
        }
        const forkName = `fork_${block.id}_${port.name}`;
        addFork(module, types, forkName, incoming.length);
        forkNames.set(`${block.id}:${port.name}`, forkName);
      }
    }

    const order = topoBlocks(view, catalog);
    const valueOf = new Map<number, { local: number; type: number }>();
    const extraLocals: number[] = [];
    let nextLocal = 1;
    const alloc = (type: number): number => {
      extraLocals.push(type);
      const slot = nextLocal;
      nextLocal += 1;
      return slot;
    };

    const statements: number[] = [
      module.memory.fill(module.i32.const(MEM.wait), module.i32.const(0), module.i32.const(4)),
      module.local.set(0, module.i32.const(CTX)),
      module.f64.store(0, 8, module.local.get(0, binaryen.i32), module.call("now", [], binaryen.f64)),
      module.i64.store(8, 8, module.local.get(0, binaryen.i32), module.i64.const(delayNs)),
    ];

    const readPort = (link: { fromBlock: number; fromOut: string; toBlock: number; toIn: string }, srcDef: BlockDef): number => {
      const stored = valueOf.get(link.fromBlock);
      if (!stored) {
        return nopConsumer(module, types);
      }
      const catalogOut = catalogPortName(link.fromOut);
      const srcPort = srcDef.outputs.find((port) => port.name === catalogOut);
      if (srcPort && isArrayType(srcPort.ty)) {
        const outgoing = view.outgoing(link.fromBlock, catalogOut);
        const dense = outgoing.findIndex(
          (item) =>
            item.fromOut === link.fromOut && item.toBlock === link.toBlock && item.toIn === link.toIn,
        );
        const slot = dense >= 0 ? dense : portSlotIndex(link.fromOut);
        return module.array.get(
          module.local.get(stored.local, stored.type),
          module.i32.const(slot),
          types.c1_f64,
          false,
        );
      }
      return module.local.get(stored.local, stored.type);
    };

    for (const block of order) {
      const def = catalog.block(block.defId);
      const name = names.get(block.id);
      if (!def || !name) {
        continue;
      }
      const args: number[] = [module.local.get(0, binaryen.i32)];
      for (const port of def.inputs) {
        const incoming = view.incoming(block.id, port.name);
        const pieces = incoming.map((link) => {
          const srcDef = catalog.block(view.defId(link.fromBlock) ?? "");
          return srcDef ? readPort(link, srcDef) : nopConsumer(module, types);
        });
        if (pieces.length === 0) {
          args.push(nopConsumer(module, types));
        } else if (pieces.length === 1) {
          args.push(pieces[0]);
        } else {
          const forkName = forkNames.get(`${block.id}:${port.name}`)!;
          args.push(
            module.call(forkName, [module.local.get(0, binaryen.i32), ...pieces], types.c1_f64),
          );
        }
      }
      const resultType = def.outputs[0]
        ? isArrayType(def.outputs[0].ty)
          ? types.array_c1_f64
          : types.c1_f64
        : binaryen.none;
      if (def.outputs.length === 0) {
        statements.push(module.call(name, args, binaryen.none));
      } else {
        const slot = alloc(resultType);
        statements.push(module.local.set(slot, module.call(name, args, resultType)));
        valueOf.set(block.id, { local: slot, type: resultType });
      }
    }

    const tick = module.addFunction(
      "tick",
      binaryen.none,
      binaryen.none,
      [binaryen.i32, ...extraLocals],
      module.block(null, statements),
    );
    nameLocals(tick, [
      "ctx",
      ...order
        .filter((block) => (catalog.block(block.defId)?.outputs.length ?? 0) > 0 && names.has(block.id))
        .map((block) => `b${block.id}`),
    ]);
    module.addFunctionExport("tick", "tick");

    if (!module.validate()) {
      throw new Error("binaryen rejected the assembled generator module");
    }
    const wasm = module.emitBinary().slice();
    if (options.emitText === false) {
      return { wasm, text: "", connectors: view.connectors };
    }
    const text = module.emitText();
    if (!text.includes(`i32.const ${SAMPLE_CAP}`)) {
      throw new Error(`push script must use SAMPLE_CAP=${SAMPLE_CAP}`);
    }
    return { wasm, text, connectors: view.connectors };
  } finally {
    module.dispose();
  }
}

export function linearSolutionView(generatorOrStages: string | readonly string[] = "timer"): SolutionView {
  const generator =
    typeof generatorOrStages === "string" ? generatorOrStages : (generatorOrStages.at(-1) ?? "timer");
  return viewFromGenerator(isGeneratorId(generator) ? generator : "timer");
}
