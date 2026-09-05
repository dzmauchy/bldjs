import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Catalog } from "@bld/xml/blocks/catalog";
import { isGeneratorId, isTransformerId } from "@bld/xml/blocks/cs/ids";
import { Diagram } from "@bld/xml/blocks/diagram";
import { portSlotIndex } from "@bld/xml/blocks/ports";
import {
  AbstractSolutionBuilder as BaseSolutionBuilder,
  type SolutionAssembly,
  type SolutionBuilder,
  type TargetAssembly,
} from "@bld/xml/solution/builder";
import { SolutionView, type SolutionViewBlock, type SolutionViewConnector } from "@bld/xml/solution/view";
import { compileMoonbit, preloadMoonc, type MoonbitTarget } from "../moonbit/compile";
import { emitSolutionFiles, moonbitText } from "../moonbit/emit";
import { BROWSER_BLOCKS, MCU_BLOCKS } from "../moonbit/scripts";
import type { MoonBlock } from "../moonbit/block";
import type { MoonbitFile } from "../moonbit/types";

export type { TargetAssembly } from "@bld/xml/solution/builder";

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
 * Abstract solution builder for a specific target.
 * Descendants encapsulate target-specific code generation and compilation.
 */
export abstract class AbstractSolutionBuilder extends BaseSolutionBuilder {
  abstract override readonly target: MoonbitTarget;

  constructor(readonly catalog: Catalog = builtinCatalog()) {
    super();
  }

  abstract getBlock(defId: string): MoonBlock | undefined;

  emitFiles(
    view: SolutionView,
    rings: Map<string, number>,
    options: { generatorId?: number; emitText?: boolean } = {},
  ): MoonbitFile[] {
    void options;
    return emitSolutionFiles(this.catalog, view, rings, this.target);
  }

  override async build(view: SolutionView, options: WasmBuildOptions = {}): Promise<TargetAssembly> {
    preloadAssembler();
    const generatorId = options.generatorId ?? options.timerId ?? view.firstGeneratorId();
    const graph = generatorId === undefined ? view : view.subgraphFromGenerator(generatorId);
    const rings = generatorId !== undefined ? assignRings(graph, generatorId) : new Map<string, number>();
    const files = this.emitFiles(graph, rings, { generatorId, emitText: options.emitText });
    const wasm = await compileMoonbit(files, { target: this.target });
    const text = options.emitText === false ? "" : moonbitText(files);
    return {
      target: this.target,
      wasm,
      text,
      connectors: graph.connectors,
    };
  }
}

/**
 * Browser solution builder: target `wasm-gc`.
 * Encapsulates browser Math/Date/setInterval/host.push bindings and atomic stop word.
 */
export class BrowserSolutionBuilder extends AbstractSolutionBuilder {
  readonly target = "wasm-gc" as const;

  getBlock(defId: string): MoonBlock | undefined {
    return BROWSER_BLOCKS[defId];
  }
}

/**
 * MCU solution builder: target `wasm` (linear MVP WebAssembly).
 * Encapsulates MCU `"env"` RTOS/WAMR host ABI and embedded math.
 */
export class McuSolutionBuilder extends AbstractSolutionBuilder {
  readonly target = "wasm" as const;

  getBlock(defId: string): MoonBlock | undefined {
    return MCU_BLOCKS[defId];
  }
}

/**
 * WASM SolutionBuilder: composes BrowserSolutionBuilder (`wasm-gc`) and McuSolutionBuilder (`wasm`).
 * Dev `start` registers the imported browser `js.setInterval`; prod exports `app_main`.
 */
export class WasmSolutionBuilder implements SolutionBuilder {
  readonly browserBuilder: BrowserSolutionBuilder;
  readonly mcuBuilder: McuSolutionBuilder;

  constructor(catalog: Catalog = builtinCatalog()) {
    this.browserBuilder = new BrowserSolutionBuilder(catalog);
    this.mcuBuilder = new McuSolutionBuilder(catalog);
  }

  async build(view: SolutionView, options: WasmBuildOptions = {}): Promise<SolutionAssembly> {
    const generatorId = options.generatorId ?? options.timerId ?? view.firstGeneratorId();
    const graph = generatorId === undefined ? view : view.subgraphFromGenerator(generatorId);
    const browser = await this.browserBuilder.build(graph, options);
    const mcu = await this.mcuBuilder.build(graph, options);
    return {
      wasm: browser.wasm,
      prodWasm: mcu.wasm,
      text: browser.text,
      connectors: graph.connectors,
    };
  }
}

export function linearSolutionView(generatorOrStages: string | readonly string[] = "timer"): SolutionView {
  const stages = typeof generatorOrStages === "string" ? [generatorOrStages] : generatorOrStages;
  return viewFromPipeline(stages);
}
