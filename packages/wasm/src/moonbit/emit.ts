import { isArrayType, type BlockDef } from "@bld/xml/blocks/ast";
import type { Catalog } from "@bld/xml/blocks/catalog";
import { catalogPortName, portSlotIndex } from "@bld/xml/blocks/ports";
import type { SolutionView, SolutionViewBlock } from "@bld/xml/solution/view";
import { BLOCK_SCRIPTS, emitFork, emitStart, preamble } from "./index";

function moonIdent(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function tupleSlot(expr: string, slot: number, length: number): string {
  return length <= 1 ? expr : `${expr}.${slot}`;
}

const NOP = "fn(_v : Double) { }";

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
 * MoonBit source for one connected SolutionView (C1 consumers, block functions, tick, start).
 * `start` registers the imported browser `setInterval`; there is no atomic wait.
 */
export function emitSolutionMoonbit(
  catalog: Catalog,
  view: SolutionView,
  rings: Map<string, number>,
): string {
  const names = new Map<number, string>();
  const lengths = new Map<number, number>();
  const defIds = new Set(view.blocks.map((block) => block.defId));
  const parts: string[] = [
    preamble({
      sin: defIds.has("sin"),
      cos: defIds.has("cos"),
      random: defIds.has("random"),
      now: defIds.has("timer"),
    }),
  ];

  for (const block of view.blocks) {
    const add = BLOCK_SCRIPTS[block.defId];
    if (!add) {
      continue;
    }
    const name = moonIdent(view.instanceName(block));
    names.set(block.id, name);
    const def = catalog.block(block.defId);
    const arrayOut = def?.outputs.find((port) => isArrayType(port.ty));
    if (arrayOut) {
      const outgoing = view.outgoing(block.id, arrayOut.name);
      const length = Math.max(outgoing.length, 1);
      lengths.set(block.id, length);
      const slotRings = Array.from({ length }, (_, slot) => {
        const link = outgoing[slot];
        if (!link) {
          return slot;
        }
        return rings.get(`${block.id}:${portSlotIndex(link.fromOut)}`) ?? slot;
      });
      parts.push(add({ name, length, rings: slotRings }));
    } else {
      parts.push(add({ name }));
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
      const forkName = `fork_${block.id}_${moonIdent(port.name)}`;
      parts.push(emitFork(forkName, incoming.length));
      forkNames.set(`${block.id}:${port.name}`, forkName);
    }
  }

  const order = topoBlocks(view, catalog);
  const valueOf = new Map<number, { expr: string; length: number; array: boolean }>();

  const readPort = (
    link: { fromBlock: number; fromOut: string; toBlock: number; toIn: string },
    srcDef: BlockDef,
  ): string => {
    const stored = valueOf.get(link.fromBlock);
    if (!stored) {
      return NOP;
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
      return tupleSlot(stored.expr, slot, stored.length);
    }
    return stored.expr;
  };

  const statements: string[] = [];
  for (const block of order) {
    const def = catalog.block(block.defId);
    const name = names.get(block.id);
    if (!def || !name) {
      continue;
    }
    const args = ["0"];
    for (const port of def.inputs) {
      const incoming = view.incoming(block.id, port.name);
      const pieces = incoming.map((link) => {
        const srcDef = catalog.block(view.defId(link.fromBlock) ?? "");
        return srcDef ? readPort(link, srcDef) : NOP;
      });
      if (pieces.length === 0) {
        args.push(NOP);
      } else if (pieces.length === 1) {
        args.push(pieces[0]!);
      } else {
        const forkName = forkNames.get(`${block.id}:${port.name}`)!;
        args.push(`${forkName}(0, ${pieces.join(", ")})`);
      }
    }
    const call = `${name}(${args.join(", ")})`;
    if (def.outputs.length === 0) {
      statements.push(`  ${call}`);
    } else {
      const local = `b${block.id}`;
      statements.push(`  let ${local} = ${call}`);
      const length = lengths.get(block.id) ?? 1;
      valueOf.set(block.id, {
        expr: local,
        length,
        array: Boolean(def.outputs[0] && isArrayType(def.outputs[0].ty)),
      });
    }
  }

  parts.push(`pub fn tick() -> Unit {
  let _ = stopped()
${statements.join("\n") || "  let _ = 0"}
}
`);
  parts.push(emitStart());
  return parts.join("\n");
}
