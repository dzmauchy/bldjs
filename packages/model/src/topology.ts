import type { Link } from "./blocks/diagram";
import { isEventDrivenGenerator, isGeneratorId } from "./blocks/cs/ids";
import { planGenerator } from "./blocks/cs/plan";
import type { GeneratorPlan, NodeSpec, ScopeChannel } from "./blocks/cs/types";
import { connectorKey } from "./blocks/ports";
import { solutionViewFrom } from "./solution/view";

type TopologyBlock = {
  id: number;
  defId: string;
  periodMs?: number;
  pin?: number;
  zeta?: number;
  omega?: number;
  value?: number;
  count?: number;
  def?: number;
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
    value: block.value,
    count: block.count,
    def: block.def,
    windowS: block.windowS,
    meterMs: block.meterMs,
  }));
}

/** Block ids, definitions, period, pin, scope window, and links — not positions — so moving a block does not restart generators. */
export function topologyKey(blocks: readonly TopologyBlock[], links: readonly Link[]): string {
  const nodes = blocks
    .map(
      (block) =>
        `${block.id}:${block.defId}:${block.periodMs ?? ""}:${block.pin ?? ""}:${block.zeta ?? ""}:${block.omega ?? ""}:${block.value ?? ""}:${block.count ?? ""}:${block.def ?? ""}:${block.windowS ?? ""}:${block.meterMs ?? ""}`,
    )
    .join(",");
  const wires = links.map((link) => connectorKey(link)).join(",");
  return `${nodes}|${wires}`;
}

export function plannedGenerators(blocks: readonly TopologyBlock[], links: readonly Link[]): GeneratorPlan[] {
  const nodes = nodeSpecsFrom(blocks);
  const wires = [...links];
  const allPlans = blocks
    .filter((block) => isGeneratorId(block.defId))
    .map((block) => planGenerator(block.id, nodes, wires))
    .filter((item): item is GeneratorPlan => item !== undefined);

  if (allPlans.length <= 1) {
    if (allPlans.length === 1) {
      allPlans[0]!.generatorIds = [allPlans[0]!.generatorId];
    }
    return allPlans;
  }

  const view = solutionViewFrom(blocks, links);
  const groups: GeneratorPlan[][] = [];
  const visited = new Set<number>();

  for (const plan of allPlans) {
    if (visited.has(plan.generatorId)) {
      continue;
    }
    const subgraph = view.subgraphFromGenerator(plan.generatorId);
    const blockIds = new Set(subgraph.blocks.map((b) => b.id));
    const group = allPlans.filter((p) => blockIds.has(p.generatorId));
    for (const p of group) {
      visited.add(p.generatorId);
    }
    groups.push(group);
  }

  return groups.map((group) => {
    if (group.length === 1) {
      const single = group[0]!;
      single.generatorIds = [single.generatorId];
      return single;
    }
    const periodic = group.filter((p) => !isEventDrivenGenerator(p.defId) && p.delayMs > 0);
    periodic.sort((a, b) => a.delayMs - b.delayMs);
    const primary = periodic[0] ?? group[0]!;
    const generatorIds = group.map((p) => p.generatorId);

    const seenChannels = new Set<string>();
    const channels: ScopeChannel[] = [];
    for (const p of [primary, ...group.filter((p) => p !== primary)]) {
      for (const ch of p.channels) {
        const key = `${ch.scopeId}:${ch.label}`;
        if (!seenChannels.has(key)) {
          seenChannels.add(key);
          channels.push(ch);
        }
      }
    }

    const scopeIds = [...new Set(channels.map((ch) => ch.scopeId))];

    return {
      ...primary,
      generatorIds,
      channels,
      scopeIds,
      scopeId: scopeIds[0] ?? primary.scopeId,
    };
  });
}
