import type { Link } from "../diagram";
import { incomingTo } from "../ports";
import { isGeneratorId, isTransformerId, periodMsFrom } from "./ids";
import { nowSecs, sampleOnce } from "./generators";
import { intervalMs } from "../../flow";
import { SampleBuf } from "./samples";
import { ForkNode, MapNode, ScopeSink, type ConsumerTree } from "./tree";
import type { F64Func, GeneratorPlan, NodeSpec } from "./types";

export { collectChannels, collectScopeIds } from "./tree";

function walkConsumer(
  id: number,
  defOf: (id: number) => string | undefined,
  links: Link[],
  depth: number,
): ConsumerTree | undefined {
  if (depth > 64) {
    return undefined;
  }
  const parts: ConsumerTree[] = [];
  for (const link of incomingTo(links, id, "in")) {
    const fromDef = defOf(link.fromBlock);
    if (fromDef === "scope") {
      parts.push(new ScopeSink(link.fromBlock));
      continue;
    }
    if (fromDef && isTransformerId(fromDef)) {
      const inner = walkConsumer(link.fromBlock, defOf, links, depth + 1);
      if (inner) {
        parts.push(new MapNode(fromDef, link.fromBlock, inner));
      }
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
  const defOf = (id: number): string | undefined => nodes.find((item) => item.id === id)?.defId;
  const tree = walkConsumer(generatorId, defOf, links, 0);
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
    delayMs: periodMsFrom(node.periodMs),
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
  return {
    emit: (time) => sink(sampleOnce(plan.defId, time)),
    delayMs: plan.delayMs,
  };
}

export function spawnTimer(compiled: CompiledTimer, running: { value: boolean }): () => void {
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
