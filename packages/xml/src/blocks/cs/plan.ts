import type { Link } from "../diagram";
import { incomingTo, portSlotIndex } from "../ports";
import {
  countFrom,
  defFrom,
  isCombinerId,
  isEventDrivenGenerator,
  isGeneratorId,
  isSinkId,
  isTransformerId,
  periodMsFrom,
} from "./ids";
import { nowSecs, sampleOnce } from "./generators";
import { intervalMs } from "../../flow";
import { SampleBuf } from "./samples";
import { ForkNode, MapNode, ProductGroup, ProductSlot, ScopeSink, type ConsumerTree } from "./tree";
import type { F64Func, GeneratorPlan, NodeSpec } from "./types";

export { collectChannels, collectScopeIds } from "./tree";

function walkConsumer(
  id: number,
  nodeOf: (id: number) => NodeSpec | undefined,
  links: Link[],
  depth: number,
  products: Map<number, ProductGroup> = new Map(),
  isTimer = true,
): ConsumerTree | undefined {
  if (depth > 64) {
    return undefined;
  }
  const parts: ConsumerTree[] = [];
  for (const link of incomingTo(links, id, "in")) {
    const from = nodeOf(link.fromBlock);
    const fromDef = from?.defId;
    if (fromDef && isSinkId(fromDef)) {
      parts.push(new ScopeSink(link.fromBlock));
      continue;
    }
    if (fromDef && isTransformerId(fromDef)) {
      const inner = walkConsumer(link.fromBlock, nodeOf, links, depth + 1, products, isTimer);
      if (inner) {
        parts.push(new MapNode(fromDef, link.fromBlock, inner, from?.zeta, from?.omega, isTimer));
      }
      continue;
    }
    if (fromDef && isCombinerId(fromDef) && from) {
      let group = products.get(from.id);
      if (!group) {
        const inner = walkConsumer(from.id, nodeOf, links, depth + 1, products, false);
        if (!inner) {
          continue;
        }
        group = new ProductGroup(from.id, countFrom(from.count), defFrom(from.def), inner);
        products.set(from.id, group);
      }
      parts.push(new ProductSlot(group, portSlotIndex(link.fromOut)));
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return new ForkNode(parts);
}

/** Walk Scope → transformers → Generator (sink flow), inserting a hidden fork when an input has many sources. */
export function planGenerator(generatorId: number, nodes: NodeSpec[], links: Link[]): GeneratorPlan | undefined {
  const node = nodes.find((item) => item.id === generatorId);
  if (!node || !isGeneratorId(node.defId)) {
    return undefined;
  }
  const nodeOf = (id: number): NodeSpec | undefined => nodes.find((item) => item.id === id);
  const tree = walkConsumer(generatorId, nodeOf, links, 0, new Map(), node.defId === "timer");
  if (!tree) {
    return undefined;
  }
  const channels = tree.collectChannels(node.defId);
  const scopeIds = [...new Set(channels.map((channel) => channel.scopeId))];
  if (scopeIds.length === 0) {
    return undefined;
  }
  return {
    generatorId,
    timerId: generatorId,
    defId: node.defId,
    scopeId: scopeIds[0],
    scopeIds,
    channels,
    delayMs: isEventDrivenGenerator(node.defId) ? 0 : periodMsFrom(node.periodMs),
    tree,
  };
}

/** @deprecated Prefer {@link planGenerator}; kept for in-process tests. */
export interface CompiledTimer {
  emit: F64Func;
  delayMs: number;
}

export function compileTimer(
  generatorId: number,
  nodes: NodeSpec[],
  links: Link[],
  buffers: Map<number, SampleBuf>,
): CompiledTimer | undefined {
  const plan = planGenerator(generatorId, nodes, links);
  if (!plan) {
    return undefined;
  }
  const sink = plan.tree.compile(buffers, { n: 0 });
  const node = nodes.find((item) => item.id === generatorId);
  return {
    emit: (time) => sink(sampleOnce(plan.defId, time, node?.value)),
    delayMs: plan.delayMs,
  };
}

export function spawnTimer(compiled: CompiledTimer, running: { value: boolean }): () => void {
  if (compiled.delayMs <= 0) {
    return () => {
      running.value = false;
    };
  }
  const delay = intervalMs(compiled.delayMs);
  const fire = (): void => {
    if (!running.value) {
      return;
    }
    compiled.emit(nowSecs());
  };
  fire();
  const interval = setInterval(() => {
    if (!running.value) {
      clearInterval(interval);
      return;
    }
    compiled.emit(nowSecs());
  }, delay);
  return () => {
    running.value = false;
    clearInterval(interval);
  };
}

export function stop(running: { value: boolean }): void {
  running.value = false;
}
