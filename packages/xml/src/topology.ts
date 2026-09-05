import type { Link } from "./blocks/diagram";
import { isGeneratorId } from "./blocks/cs/ids";
import { planGenerator } from "./blocks/cs/plan";
import type { GeneratorPlan, NodeSpec } from "./blocks/cs/types";
import { connectorKey } from "./blocks/ports";

type TopologyBlock = {
  id: number;
  defId: string;
  periodMs?: number;
  pin?: number;
  zeta?: number;
  omega?: number;
  windowS?: number;
  meterMs?: number;
};

export function nodeSpecsFrom(blocks: readonly TopologyBlock[]): NodeSpec[] {
  return blocks.map((block) => ({
    id: block.id,
    defId: block.defId,
    periodMs: block.periodMs,
    pin: block.pin,
    zeta: block.zeta,
    omega: block.omega,
    windowS: block.windowS,
    meterMs: block.meterMs,
  }));
}

/** Block ids, definitions, period, pin, scope window, and links — not positions — so moving a block does not restart generators. */
export function topologyKey(blocks: readonly TopologyBlock[], links: readonly Link[]): string {
  const nodes = blocks
    .map(
      (block) =>
        `${block.id}:${block.defId}:${block.periodMs ?? ""}:${block.pin ?? ""}:${block.zeta ?? ""}:${block.omega ?? ""}:${block.windowS ?? ""}:${block.meterMs ?? ""}`,
    )
    .join(",");
  const wires = links.map((link) => connectorKey(link)).join(",");
  return `${nodes}|${wires}`;
}

export function plannedGenerators(blocks: readonly TopologyBlock[], links: readonly Link[]): GeneratorPlan[] {
  const nodes = nodeSpecsFrom(blocks);
  const wires = [...links];
  return blocks
    .filter((block) => isGeneratorId(block.defId))
    .map((block) => planGenerator(block.id, nodes, wires))
    .filter((item): item is GeneratorPlan => item !== undefined);
}
