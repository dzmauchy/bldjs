import { type Link, type NodeSpec, planGenerator, type GeneratorPlan } from "./blocks";

export function nodeSpecsFrom(blocks: readonly { id: number; defId: string }[]): NodeSpec[] {
  return blocks.map((block) => ({ id: block.id, defId: block.defId }));
}

/** Block ids, definitions, and links — not positions — so moving a block does not restart generators. */
export function topologyKey(
  blocks: readonly { id: number; defId: string }[],
  links: readonly Link[],
): string {
  const nodes = blocks.map((block) => `${block.id}:${block.defId}`).join(",");
  const wires = links
    .map((link) => `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`)
    .join(",");
  return `${nodes}|${wires}`;
}

export function plannedGenerators(
  blocks: readonly { id: number; defId: string }[],
  links: readonly Link[],
): GeneratorPlan[] {
  const nodes = nodeSpecsFrom(blocks);
  const wires = [...links];
  return blocks
    .filter((block) => block.defId === "timer")
    .map((block) => planGenerator(block.id, nodes, wires))
    .filter((item): item is GeneratorPlan => item !== undefined);
}
