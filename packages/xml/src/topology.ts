import type { Link } from "./blocks/diagram";
import { isGeneratorId } from "./blocks/cs/ids";
import { planGenerator } from "./blocks/cs/plan";
import type { GeneratorPlan, NodeSpec } from "./blocks/cs/types";

export function nodeSpecsFrom(
  blocks: readonly { id: number; defId: string; periodMs?: number }[],
): NodeSpec[] {
  return blocks.map((block) => ({ id: block.id, defId: block.defId, periodMs: block.periodMs }));
}

/** Block ids, definitions, period, and links — not positions — so moving a block does not restart generators. */
export function topologyKey(
  blocks: readonly { id: number; defId: string; periodMs?: number }[],
  links: readonly Link[],
): string {
  const nodes = blocks.map((block) => `${block.id}:${block.defId}:${block.periodMs ?? ""}`).join(",");
  const wires = links
    .map((link) => `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`)
    .join(",");
  return `${nodes}|${wires}`;
}

export function plannedGenerators(
  blocks: readonly { id: number; defId: string; periodMs?: number }[],
  links: readonly Link[],
): GeneratorPlan[] {
  const nodes = nodeSpecsFrom(blocks);
  const wires = [...links];
  return blocks
    .filter((block) => isGeneratorId(block.defId))
    .map((block) => planGenerator(block.id, nodes, wires))
    .filter((item): item is GeneratorPlan => item !== undefined);
}
