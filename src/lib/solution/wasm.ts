import type { BlockDef } from "$lib/blocks/ast";
import { isArrayType } from "$lib/blocks/ast";
import { Catalog } from "$lib/blocks/catalog";
import { associateBuiltinModels } from "$lib/blocks/builtin";
import { Diagram } from "$lib/blocks/diagram";
import { catalogPortName, portSlotIndex } from "$lib/blocks/ports";
import { canShareMemory } from "$lib/isolation";
import { CTX, SAMPLE_CAP } from "$lib/runtime/memory";
import type { SolutionAssembly, SolutionBuilder } from "./builder";
import {
  type SolutionView,
  type SolutionViewBlock,
  type SolutionViewConnector,
  defIdOf,
  firstTimerId,
  incomingConnectors,
  instanceName,
  outgoingConnectors,
  subgraphFromTimer,
} from "./view";

export interface WasmBuildOptions {
  delayMs?: number;
  timerId?: number;
  /** Shared memory + atomics. Off when the page is not cross-origin isolated. */
  sharedMemory?: boolean;
  /** WAT text is expensive; skip it on the Run hot path. */
  emitText?: boolean;
}

let assemblerPreload: Promise<unknown> | undefined;

/** Start loading binaryen.js before the user presses Run. */
export function preloadAssembler(): void {
  assemblerPreload ??= Promise.all([
    import("binaryen"),
    import("../../resources/binaryen"),
    import("../../resources/binaryen/util"),
  ]);
}

function builtinCatalog(): Catalog {
  const diagram = new Diagram("solution", "Solution");
  associateBuiltinModels(diagram);
  return diagram.catalog();
}

function viewFromStages(stages: readonly string[]): SolutionView {
  const blocks: SolutionViewBlock[] = [{ id: 1, defId: "oscilloscope" }];
  const connectors: SolutionViewConnector[] = [];
  let prev = 1;
  let nextId = 2;
  for (const stage of stages) {
    const id = nextId;
    nextId += 1;
    blocks.push({ id, defId: stage });
    connectors.push({ fromBlock: prev, fromOut: "out", toBlock: id, toIn: "in" });
    prev = id;
  }
  const timerId = nextId;
  blocks.push({ id: timerId, defId: "timer" });
  connectors.push({ fromBlock: prev, fromOut: "out", toBlock: timerId, toIn: "in" });
  return { blocks, connectors };
}

/**
 * Assign a sample ring to each oscilloscope vector slot, walking incoming wires from the timer
 * (same order the UI uses for Chart.js datasets).
 */
export function assignRings(view: SolutionView, timerId: number): Map<string, number> {
  const rings = new Map<string, number>();
  const walk = (id: number, depth: number): void => {
    if (depth > 64) {
      return;
    }
    for (const link of incomingConnectors(view, id, "in")) {
      const fromDef = defIdOf(view, link.fromBlock);
      if (fromDef === "oscilloscope") {
        const key = `${link.fromBlock}:${portSlotIndex(link.fromOut)}`;
        if (!rings.has(key)) {
          rings.set(key, rings.size);
        }
      } else if (fromDef) {
        walk(link.fromBlock, depth + 1);
      }
    }
  };
  walk(timerId, 0);
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
      for (const link of incomingConnectors(view, block.id, port.name)) {
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
    const timerId = options.timerId ?? firstTimerId(view);
    const graph = timerId === undefined ? view : subgraphFromTimer(view, timerId);
    const delayMs =
      options.delayMs ?? graph.blocks.filter((block) => block.defId === "quantizer").length * 10;
    return emitWasm(this.catalog, graph, {
      delayMs,
      timerId,
      sharedMemory: options.sharedMemory ?? canShareMemory(),
      emitText: options.emitText,
    });
  }
}

async function emitWasm(
  catalog: Catalog,
  view: SolutionView,
  options: { delayMs: number; timerId?: number; sharedMemory: boolean; emitText?: boolean },
): Promise<SolutionAssembly> {
  preloadAssembler();
  const [{ default: binaryen }, scripts, { nameLocals }] = await Promise.all([
    import("binaryen"),
    import("../../resources/binaryen"),
    import("../../resources/binaryen/util"),
  ]);
  const { BLOCK_SCRIPTS, RUNTIME_SCRIPTS, addCatalogTypes, GC_FEATURES, nopConsumer, addFork } = scripts;
  const delayNs = BigInt(Math.max(options.delayMs, 1)) * 1_000_000n;
  const module = new binaryen.Module();
  try {
    module.setFeatures(GC_FEATURES(binaryen));
    const types = addCatalogTypes(binaryen, module);
    RUNTIME_SCRIPTS.imports(module, options.sharedMemory);
    RUNTIME_SCRIPTS.push(module, SAMPLE_CAP);

    const rings = options.timerId !== undefined ? assignRings(view, options.timerId) : new Map<string, number>();
    const names = new Map<number, string>();
    for (const block of view.blocks) {
      const add = BLOCK_SCRIPTS[block.defId];
      if (!add) {
        continue;
      }
      const name = instanceName(view, block);
      names.set(block.id, name);
      const def = catalog.block(block.defId);
      const arrayOut = def?.outputs.find((port) => isArrayType(port.ty));
      if (arrayOut) {
        const outgoing = outgoingConnectors(view, block.id, arrayOut.name);
        const length = Math.max(outgoing.length, 1);
        const slotRings = Array.from({ length }, (_, slot) => rings.get(`${block.id}:${slot}`) ?? slot);
        add(module, types, { name, length, rings: slotRings });
      } else {
        add(module, types, { name });
      }
    }

    const forkNames = new Map<string, string>();
    for (const block of view.blocks) {
      const def = catalog.block(block.defId);
      if (!def) {
        continue;
      }
      for (const port of def.inputs) {
        const incoming = incomingConnectors(view, block.id, port.name);
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
      module.local.set(0, module.i32.const(CTX)),
      module.f64.store(0, 8, module.local.get(0, binaryen.i32), module.call("now", [], binaryen.f64)),
      module.i64.store(8, 8, module.local.get(0, binaryen.i32), module.i64.const(delayNs)),
    ];

    const readPort = (link: { fromBlock: number; fromOut: string }, srcDef: BlockDef): number => {
      const stored = valueOf.get(link.fromBlock);
      if (!stored) {
        return nopConsumer(module, types);
      }
      const catalogOut = catalogPortName(link.fromOut);
      const srcPort = srcDef.outputs.find((port) => port.name === catalogOut);
      if (srcPort && isArrayType(srcPort.ty)) {
        return module.array.get(
          module.local.get(stored.local, stored.type),
          module.i32.const(portSlotIndex(link.fromOut)),
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
        const incoming = incomingConnectors(view, block.id, port.name);
        const pieces = incoming.map((link) => {
          const srcDef = catalog.block(defIdOf(view, link.fromBlock) ?? "");
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

export function linearSolutionView(stages: readonly string[]): SolutionView {
  return viewFromStages(stages);
}
