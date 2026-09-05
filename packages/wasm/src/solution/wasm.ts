import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Catalog } from "@bld/xml/blocks/catalog";
import { isGeneratorId, isTransformerId } from "@bld/xml/blocks/cs/ids";
import { Diagram } from "@bld/xml/blocks/diagram";
import { portSlotIndex } from "@bld/xml/blocks/ports";
import type { SolutionAssembly, SolutionBuilder } from "@bld/xml/solution/builder";
import { SolutionView, type SolutionViewBlock, type SolutionViewConnector } from "@bld/xml/solution/view";
import { compileMoonbit, preloadMoonc } from "../moonbit/compile";
import { emitSolutionFiles, moonbitText } from "../moonbit/emit";

export interface WasmBuildOptions {
  delayMs?: number;
  generatorId?: number;
  /** @deprecated Use {@link generatorId}. */
  timerId?: number;
  /** Shared sample buffer. Off when the page is not cross-origin isolated. */
  sharedMemory?: boolean;
  /** MoonBit source is cheap; skip it on the Run hot path. */
  emitText?: boolean;
}

let assemblerPreload: Promise<unknown> | undefined;

/**
 * Start loading moonc-worker before the user presses Run.
 * Callers must keep this a dynamic import: a static import of
 * `@moonbit/moonc-worker` from the public package entry puts ~5.6MB on first paint.
 */
export function preloadAssembler(): void {
  assemblerPreload ??= preloadMoonc();
}

function builtinCatalog(): Catalog {
  const diagram = new Diagram("solution", "Solution");
  associateBuiltinModels(diagram);
  return diagram.catalog();
}

/** Linear sink flow: `scope → transformers… → generator`. */
function viewFromPipeline(stages: readonly string[]): SolutionView {
  let generator = "timer";
  for (const id of stages) {
    if (isGeneratorId(id)) {
      generator = id;
    }
  }
  const transformers = stages.filter((id) => isTransformerId(id));
  const blocks: SolutionViewBlock[] = [{ id: 1, defId: "scope" }];
  const links: SolutionViewConnector[] = [];
  let fromId = 1;
  let fromOut = "out";
  let nextId = 2;
  for (const defId of transformers) {
    const id = nextId;
    nextId += 1;
    blocks.push({ id, defId });
    links.push({ fromBlock: fromId, fromOut, toBlock: id, toIn: "in" });
    fromId = id;
    fromOut = "out";
  }
  blocks.push({ id: nextId, defId: generator });
  links.push({ fromBlock: fromId, fromOut, toBlock: nextId, toIn: "in" });
  return new SolutionView(blocks, links);
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

/**
 * WASM SolutionBuilder: emit MoonBit for each SolutionViewBlock.
 * Compiles two modules: browser `wasm-gc` (`wasm`) and MCU linear `wasm` (`prodWasm`).
 * Dev `start` registers the imported browser `js.setInterval`; prod exports `app_main`.
 */
export class WasmSolutionBuilder implements SolutionBuilder {
  constructor(private readonly catalog: Catalog = builtinCatalog()) {}

  async build(view: SolutionView, options: WasmBuildOptions = {}): Promise<SolutionAssembly> {
    const generatorId = options.generatorId ?? options.timerId ?? view.firstGeneratorId();
    const graph = generatorId === undefined ? view : view.subgraphFromGenerator(generatorId);
    return emitWasm(this.catalog, graph, {
      generatorId,
      emitText: options.emitText,
    });
  }
}

async function emitWasm(
  catalog: Catalog,
  view: SolutionView,
  options: { generatorId?: number; emitText?: boolean },
): Promise<SolutionAssembly> {
  preloadAssembler();
  const rings = options.generatorId !== undefined ? assignRings(view, options.generatorId) : new Map<string, number>();
  const files = emitSolutionFiles(catalog, view, rings, "wasm-gc");
  const prodFiles = emitSolutionFiles(catalog, view, rings, "wasm");
  const wasm = await compileMoonbit(files, { target: "wasm-gc" });
  const prodWasm = await compileMoonbit(prodFiles, { target: "wasm" });
  if (options.emitText === false) {
    return { wasm, prodWasm, text: "", connectors: view.connectors };
  }
  return { wasm, prodWasm, text: moonbitText(files), connectors: view.connectors };
}

export function linearSolutionView(generatorOrStages: string | readonly string[] = "timer"): SolutionView {
  const stages = typeof generatorOrStages === "string" ? [generatorOrStages] : generatorOrStages;
  return viewFromPipeline(stages);
}
