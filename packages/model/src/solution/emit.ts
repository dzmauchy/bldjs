import {
  COUNT_PARAM,
  DEF_PARAM,
  METER_PARAM,
  OMEGA_PARAM,
  PERIOD_PARAM,
  PIN_PARAM,
  VALUE_PARAM,
  WINDOW_PARAM,
  ZETA_PARAM,
  countFrom,
  defFrom,
  isGeneratorId,
  meterMsFrom,
  omegaFrom,
  periodMsFrom,
  pinFrom,
  valueFrom,
  windowSecondsFrom,
  zetaFrom,
} from "../blocks/cs/ids";
import { portSlotIndex } from "../blocks/ports";
import type { Link } from "../blocks/diagram";
import type { BlockExtras, BlockInstance } from "../diagram/types";

export const BLOCK_FN: Record<string, string> = {
  timer: "com.dauch.cs.gen.timer",
  random: "com.dauch.cs.gen.random",
  constant: "com.dauch.cs.gen.constant",
  gpio_in: "com.dauch.cs.gpio.gpio_in",
  gpio_out: "com.dauch.cs.gpio.gpio_out",
  sin: "com.dauch.cs.tf.sin",
  cos: "com.dauch.cs.tf.cos",
  overshoot: "com.dauch.cs.tf.overshoot",
  product: "com.dauch.cs.tf.product",
  scope: "com.dauch.cs.sink.scope",
};

const MULTI_OUT = new Set(["scope", "product"]);

function extrasFor(block: BlockInstance, extras: Map<number, BlockExtras> | undefined): BlockExtras {
  return extras?.get(block.id) ?? { parameters: [] };
}

function param(extra: BlockExtras, name: string): string | undefined {
  return extra.parameters.find((item) => item.name === name)?.value;
}

function incomingTo(links: readonly Link[], toBlock: number, port: string): Link[] {
  const catalog = port.replace(/\[\d+]$/, "");
  return links.filter((link) => link.toBlock === toBlock && (link.toIn === port || link.toIn.replace(/\[\d+]$/, "") === catalog));
}

function outgoingFrom(links: readonly Link[], fromBlock: number, port: string): Link[] {
  const catalog = port.replace(/\[\d+]$/, "");
  return links.filter(
    (link) => link.fromBlock === fromBlock && (link.fromOut === port || link.fromOut.replace(/\[\d+]$/, "") === catalog),
  );
}

function topoBlocks(blocks: readonly BlockInstance[], links: readonly Link[]): BlockInstance[] {
  const remaining = new Map(blocks.map((block) => [block.id, block]));
  const ready: BlockInstance[] = [];
  const emitted = new Set<number>();
  while (remaining.size > 0) {
    let progress = false;
    for (const [id, block] of remaining) {
      const deps = links.filter((link) => link.toBlock === id).map((link) => link.fromBlock);
      if (deps.every((dep) => emitted.has(dep) || !remaining.has(dep))) {
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

function linkIndex(links: readonly Link[], link: Link): number {
  return links.findIndex(
    (item) =>
      item.fromBlock === link.fromBlock &&
      item.fromOut === link.fromOut &&
      item.toBlock === link.toBlock &&
      item.toIn === link.toIn,
  );
}

function readPort(links: readonly Link[], link: Link, fromDef: string): string {
  const local = `b${link.fromBlock}`;
  const idx = linkIndex(links, link);
  const tapped = (expr: string) => (idx >= 0 ? `tap(${idx}, ${expr})` : expr);
  if (MULTI_OUT.has(fromDef)) {
    const outgoing = outgoingFrom(links, link.fromBlock, "out");
    const dense = outgoing.findIndex(
      (item) =>
        item.fromOut === link.fromOut && item.toBlock === link.toBlock && item.toIn === link.toIn,
    );
    const slotIndex = dense >= 0 ? dense : portSlotIndex(link.fromOut);
    return tapped(`slot(${local}, ${slotIndex})`);
  }
  return tapped(local);
}

function inputExpr(block: BlockInstance, links: readonly Link[], defOf: Map<number, string>): string {
  const incoming = incomingTo(links, block.id, "in");
  const pieces = incoming.map((link) => {
    const fromDef = defOf.get(link.fromBlock) ?? "";
    return readPort(links, link, fromDef);
  });
  if (pieces.length === 0) {
    return "nop";
  }
  if (pieces.length === 1) {
    return pieces[0]!;
  }
  return `fork(${pieces.join(", ")})`;
}

export type DiagramEmitInput = {
  blocks: readonly BlockInstance[];
  links: readonly Link[];
  extras?: Map<number, BlockExtras>;
};

/** Executable body inside `diagram()`: instantiate CS blocks in sink-to-source order. */
export function emitDiagramStart(canvas: DiagramEmitInput): string {
  const extras = canvas.extras ?? new Map<number, BlockExtras>();
  const runnable = canvas.blocks.filter((block) => BLOCK_FN[block.defId]);
  if (runnable.length === 0) {
    return "  // no executable CS blocks";
  }
  const defOf = new Map(canvas.blocks.map((block) => [block.id, block.defId]));
  const order = topoBlocks(runnable, canvas.links);
  const lines: string[] = [];
  for (const block of order) {
    const extra = extrasFor(block, extras);
    const fn = BLOCK_FN[block.defId]!;
    lines.push(`  host.enter(${block.id});`);
    if (block.defId === "scope") {
      const n = windowSecondsFrom(param(extra, WINDOW_PARAM));
      const m = meterMsFrom(param(extra, METER_PARAM));
      lines.push(`  const b${block.id} = ${fn}(${n}, ${m});`);
      continue;
    }
    if (block.defId === "gpio_out") {
      const pin = pinFrom(param(extra, PIN_PARAM) ?? "1");
      lines.push(`  const b${block.id} = ${fn}(${pin});`);
      continue;
    }
    if (block.defId === "sin" || block.defId === "cos") {
      lines.push(`  const b${block.id} = ${fn}(${inputExpr(block, canvas.links, defOf)});`);
      continue;
    }
    if (block.defId === "overshoot") {
      const z = zetaFrom(param(extra, ZETA_PARAM));
      const w = omegaFrom(param(extra, OMEGA_PARAM));
      lines.push(`  const b${block.id} = ${fn}(${z}, ${w}, ${inputExpr(block, canvas.links, defOf)});`);
      continue;
    }
    if (block.defId === "product") {
      const n = countFrom(param(extra, COUNT_PARAM));
      const def = defFrom(param(extra, DEF_PARAM));
      lines.push(`  const b${block.id} = ${fn}(${n}, ${def}, ${inputExpr(block, canvas.links, defOf)});`);
      continue;
    }
    if (isGeneratorId(block.defId)) {
      const inp = inputExpr(block, canvas.links, defOf);
      if (block.defId === "constant") {
        const value = valueFrom(param(extra, VALUE_PARAM));
        const period = periodMsFrom(param(extra, PERIOD_PARAM));
        lines.push(`  ${fn}(${value}, ${period}, ${inp});`);
      } else if (block.defId === "gpio_in") {
        const pin = pinFrom(param(extra, PIN_PARAM));
        lines.push(`  ${fn}(${pin}, ${inp});`);
      } else {
        const period = periodMsFrom(param(extra, PERIOD_PARAM));
        lines.push(`  ${fn}(${period}, ${inp});`);
      }
      continue;
    }
  }
  return lines.join("\n");
}
