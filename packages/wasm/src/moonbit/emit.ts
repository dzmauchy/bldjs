import { isArrayType, type BlockDef } from "@bld/xml/blocks/ast";
import type { Catalog } from "@bld/xml/blocks/catalog";
import { DEFAULT_PERIOD_MS, isEventDrivenGenerator, isGeneratorId, isTransformerId } from "@bld/xml/blocks/cs/ids";
import { catalogPortName, portSlotIndex } from "@bld/xml/blocks/ports";
import type { SolutionView, SolutionViewBlock } from "@bld/xml/solution/view";
import { DEV_TARGET, type MoonbitTarget } from "./compile";
import { emitFork } from "./fork";
import { emitAppMain, emitStart, PIN_INPUT_PULLUP, PIN_OUTPUT, preamble } from "./runtime";
import { BLOCK_SCRIPTS } from "./scripts";
import type { MoonbitFile } from "./types";

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

function joinParts(parts: string[]): string {
  return `${parts.filter((part) => part.trim().length > 0).join("\n")}\n`;
}

/** Concatenate generated package files for tests and `emitText`. */
export function moonbitText(files: readonly MoonbitFile[]): string {
  return `${files.map(([, source]) => source.replace(/\n+$/, "")).join("\n\n")}\n`;
}

/**
 * MoonBit package files for one connected SolutionView.
 * `runtime.mbt` holds FFI, atomics, `C1`, and `start` / `app_main`.
 * `blocks.mbt` holds XML block functions and hidden forks.
 * `main.mbt` holds `tick`.
 */
export function emitSolutionFiles(
  catalog: Catalog,
  view: SolutionView,
  rings: Map<string, number>,
  target: MoonbitTarget = DEV_TARGET,
): MoonbitFile[] {
  const names = new Map<number, string>();
  const lengths = new Map<number, number>();
  const defIds = new Set(view.blocks.map((block) => block.defId));
  const blockParts: string[] = [];

  for (const block of view.blocks) {
    const add = BLOCK_SCRIPTS[block.defId];
    if (!add) {
      continue;
    }
    const name = moonIdent(view.instanceName(block));
    names.set(block.id, name);
    const def = catalog.block(block.defId);
    const arrayOut = def?.outputs.find((port) => isArrayType(port.ty));
    const pin = block.pin ?? (block.defId === "gpio_out" ? 1 : 0);
    const zeta = block.zeta;
    const omega = block.omega;
    const value = block.value;
    const factorDef = block.def;
    let timeInput: boolean | undefined = undefined;
    if (block.defId === "overshoot") {
      let isTimer = false;
      let curr = view.outgoing(block.id, "out")[0]?.toBlock;
      while (curr !== undefined) {
        const d = view.defId(curr);
        if (d === "timer") {
          isTimer = true;
          break;
        }
        if (d && isTransformerId(d)) {
          curr = view.outgoing(curr, "out")[0]?.toBlock;
        } else {
          break;
        }
      }
      timeInput = isTimer;
    }
    if (arrayOut) {
      const outgoing = view.outgoing(block.id, arrayOut.name);
      const length = Math.max(outgoing.length, block.count ?? 1, 1);
      lengths.set(block.id, length);
      const slotRings = Array.from({ length }, (_, slot) => {
        const link = outgoing[slot];
        if (!link) {
          return slot;
        }
        return rings.get(`${block.id}:${portSlotIndex(link.fromOut)}`) ?? slot;
      });
      blockParts.push(add({ name, length, rings: slotRings, pin, zeta, omega, value, def: factorDef, timeInput }));
    } else {
      blockParts.push(add({ name, pin, zeta, omega, value, def: factorDef, timeInput }));
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
      blockParts.push(emitFork(forkName, incoming.length));
      forkNames.set(`${block.id}:${port.name}`, forkName);
    }
  }

  const order = topoBlocks(view, catalog);
  const valueOf = new Map<number, { expr: string; length: number }>();

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
        const expr = srcDef ? readPort(link, srcDef) : NOP;
        const idx = view.connectors.findIndex(
          (item) =>
            item.fromBlock === link.fromBlock &&
            item.fromOut === link.fromOut &&
            item.toBlock === link.toBlock &&
            item.toIn === link.toIn,
        );
        return idx >= 0 ? `introspect(${idx}, ${expr})` : expr;
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
      valueOf.set(block.id, {
        expr: local,
        length: lengths.get(block.id) ?? 1,
      });
    }
  }

  const generators = view.blocks.filter((block) => isGeneratorId(block.defId));
  const timedGenerator = generators.find((block) => !isEventDrivenGenerator(block.defId));
  const eventDriven = generators.length > 0 && timedGenerator === undefined;
  const delayMs = eventDriven ? 0 : (timedGenerator?.periodMs ?? DEFAULT_PERIOD_MS);
  const pins = view.blocks.flatMap((block) => {
    if (block.defId === "gpio_in") {
      return [{ pin: block.pin ?? 0, mode: PIN_INPUT_PULLUP }];
    }
    if (block.defId === "gpio_out") {
      return [{ pin: block.pin ?? 1, mode: PIN_OUTPUT }];
    }
    return [];
  });
  const runtimeParts =
    target === "wasm"
      ? [
          preamble({
            sin: defIds.has("sin") || defIds.has("overshoot"),
            cos: defIds.has("cos") || defIds.has("overshoot"),
            exp: defIds.has("overshoot"),
            sqrt: defIds.has("overshoot"),
            random: defIds.has("random"),
            now: defIds.has("timer") || defIds.has("overshoot"),
            gpio: defIds.has("gpio_in") || defIds.has("gpio_out"),
            timer: !eventDriven,
            target,
          }),
          emitAppMain({ delayMs, pins, eventDriven }),
        ]
      : [
          preamble({
            sin: defIds.has("sin") || defIds.has("overshoot"),
            cos: defIds.has("cos") || defIds.has("overshoot"),
            exp: defIds.has("overshoot"),
            sqrt: defIds.has("overshoot"),
            random: defIds.has("random"),
            now: defIds.has("timer") || defIds.has("overshoot"),
            gpio: defIds.has("gpio_in") || defIds.has("gpio_out"),
            target,
          }),
          emitStart(),
        ];

  return [
    ["runtime.mbt", joinParts(runtimeParts)],
    ["blocks.mbt", joinParts(blockParts)],
    [
      "main.mbt",
      `pub fn tick() -> Unit {
  stopped()
${statements.join("\n") || "  ()"}
}
`,
    ],
  ];
}

/**
 * MoonBit source for one connected SolutionView (C1 consumers, block functions, tick, start).
 * `start` registers the imported browser `setInterval`; there is no atomic wait.
 */
export function emitSolutionMoonbit(
  catalog: Catalog,
  view: SolutionView,
  rings: Map<string, number>,
  target: MoonbitTarget = DEV_TARGET,
): string {
  return moonbitText(emitSolutionFiles(catalog, view, rings, target));
}
