import type { BlockDef } from "$lib/blocks/ast";
import { isArrayType } from "$lib/blocks/ast";
import { Catalog } from "$lib/blocks/catalog";
import { associateBuiltinModels } from "$lib/blocks/builtin";
import { Diagram } from "$lib/blocks/diagram";
import { catalogPortName, portSlotIndex } from "$lib/blocks/ports";
import { canShareMemory } from "$lib/isolation";
import { SAMPLE_CAP } from "$lib/runtime/memory";
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
  /** AssemblyScript source is cheap; skip it only when the caller asks. */
  emitText?: boolean;
}

type CompileString = (
  sources: string,
  options?: Record<string, unknown>,
) => Promise<{ error: Error | null; binary: Uint8Array | null; stderr: { toString(): string } }>;

let assemblerPreload: Promise<unknown> | undefined;

function compileStringOf(mod: unknown): CompileString {
  const rec = mod as { compileString?: CompileString; default?: { compileString?: CompileString } };
  const compileString = rec.compileString ?? rec.default?.compileString;
  if (!compileString) {
    throw new Error("assemblyscript/asc is missing compileString");
  }
  return compileString;
}

/** Start loading the AssemblyScript compiler before the user presses Run. */
export function preloadAssembler(): void {
  assemblerPreload ??= import("assemblyscript/asc");
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

function arrayOutLength(view: SolutionView, blockId: number, def: BlockDef): number {
  const arrayOut = def.outputs.find((port) => isArrayType(port.ty));
  if (!arrayOut) {
    return 1;
  }
  return Math.max(outgoingConnectors(view, blockId, arrayOut.name).length, 1);
}

function slotConsumer(
  view: SolutionView,
  catalog: Catalog,
  names: Map<number, string>,
  link: { fromBlock: number; fromOut: string },
): string {
  const srcName = names.get(link.fromBlock);
  if (!srcName) {
    return "nop";
  }
  const srcDef = catalog.block(defIdOf(view, link.fromBlock) ?? "");
  if (!srcDef) {
    return "nop";
  }
  const catalogOut = catalogPortName(link.fromOut);
  const srcPort = srcDef.outputs.find((port) => port.name === catalogOut);
  if (srcPort && isArrayType(srcPort.ty)) {
    const length = arrayOutLength(view, link.fromBlock, srcDef);
    const slot = portSlotIndex(link.fromOut);
    return length === 1 ? srcName : `${srcName}_${slot}`;
  }
  return srcName;
}

function portConsumer(
  view: SolutionView,
  catalog: Catalog,
  names: Map<number, string>,
  block: SolutionViewBlock,
  portName: string,
): { inner: string; fork?: { name: string; inners: string[] } } {
  const incoming = incomingConnectors(view, block.id, portName);
  if (incoming.length === 0) {
    return { inner: "nop" };
  }
  const pieces = incoming.map((link) => slotConsumer(view, catalog, names, link));
  if (pieces.length === 1) {
    return { inner: pieces[0] ?? "nop" };
  }
  return { inner: `fork_${block.id}_${portName}`, fork: { name: `fork_${block.id}_${portName}`, inners: pieces } };
}

/** AssemblyScript source for one connected SolutionView (type aliases, block functions, tick). */
export function emitSolutionAs(
  catalog: Catalog,
  view: SolutionView,
  options: { delayMs: number; timerId?: number },
  scripts: typeof import("../../resources/assemblyscript"),
): string {
  const delayNs = BigInt(Math.max(options.delayMs, 1)) * 1_000_000n;
  const rings = options.timerId !== undefined ? assignRings(view, options.timerId) : new Map<string, number>();
  const names = new Map<number, string>();
  for (const block of view.blocks) {
    if (scripts.BLOCK_AS[block.defId]) {
      names.set(block.id, instanceName(view, block));
    }
  }

  const parts: string[] = [scripts.preambleAs()];
  const forks = new Map<string, string[]>();
  const inners = new Map<number, string>();

  for (const block of view.blocks) {
    const def = catalog.block(block.defId);
    if (!def || !names.has(block.id)) {
      continue;
    }
    for (const port of def.inputs) {
      const wired = portConsumer(view, catalog, names, block, port.name);
      inners.set(block.id, wired.inner);
      if (wired.fork && !forks.has(wired.fork.name)) {
        forks.set(wired.fork.name, wired.fork.inners);
      }
    }
  }

  for (const [forkName, forkInners] of forks) {
    parts.push(scripts.emitFork(forkName, forkInners));
  }

  for (const block of view.blocks) {
    const def = catalog.block(block.defId);
    const name = names.get(block.id);
    if (!def || !name) {
      continue;
    }
    const arrayOut = def.outputs.find((port) => isArrayType(port.ty));
    if (arrayOut) {
      const length = arrayOutLength(view, block.id, def);
      const slotRings = Array.from({ length }, (_, slot) => rings.get(`${block.id}:${slot}`) ?? slot);
      parts.push(scripts.emitBlockInstance(block.defId, { name, length, rings: slotRings }));
      continue;
    }
    parts.push(scripts.emitBlockInstance(block.defId, { name, inner: inners.get(block.id) ?? "nop" }));
  }

  const timers = view.blocks.filter((block) => block.defId === "timer" && names.has(block.id));
  const ticks = timers.map((block) => `  ${names.get(block.id)}();`).join("\n");
  parts.push(`export function tick(): void {
  store<f64>(CTX, now());
  store<i64>(CTX + 8, ${delayNs.toString()});
${ticks || "  nop(0);"}
}
`);
  return parts.join("\n");
}

/**
 * WASM SolutionBuilder: one XML-matching AssemblyScript function per SolutionViewBlock,
 * then SolutionViewConnectors to wire the module (vector slots, fork, direct calls).
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
  const [ascMod, scripts] = await Promise.all([
    assemblerPreload ?? import("assemblyscript/asc"),
    import("../../resources/assemblyscript"),
  ]);
  const compileString = compileStringOf(ascMod);
  const source = emitSolutionAs(catalog, view, options, scripts);
  const result = await compileString(source, scripts.compileOptions({ sharedMemory: options.sharedMemory }));
  const binary = result.binary;
  if (result.error || !binary) {
    const detail = result.stderr?.toString() || result.error?.message || "unknown error";
    throw new Error(`AssemblyScript rejected the assembled generator module: ${detail}`);
  }
  const wasm = binary.slice();
  if (options.emitText === false) {
    return { wasm, text: "", connectors: view.connectors };
  }
  if (!source.includes(`SAMPLE_CAP: i32 = ${SAMPLE_CAP}`)) {
    throw new Error(`push script must use SAMPLE_CAP=${SAMPLE_CAP}`);
  }
  return { wasm, text: source, connectors: view.connectors };
}

export function linearSolutionView(stages: readonly string[]): SolutionView {
  return viewFromStages(stages);
}
