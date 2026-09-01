import type { Link } from "../diagram";
import { catalogPortName, portSlotIndex } from "../ports";
import { isGeneratorId, isTransformerId, periodMsFrom } from "./ids";
import { fork, nowSecs, sampleOnce } from "./generators";
import { mapOnce } from "./transformers";
import { SampleBuf } from "./samples";
import type { ConsumerTree, F64Func, GeneratorPlan, NodeSpec, ScopeChannel } from "./types";

function incomingTo(links: Link[], to: number, port: string): Link[] {
  const catalog = catalogPortName(port);
  return links
    .filter((link) => link.toBlock === to && catalogPortName(link.toIn) === catalog)
    .toSorted(
      (left, right) =>
        portSlotIndex(left.toIn) - portSlotIndex(right.toIn) ||
        left.fromBlock - right.fromBlock ||
        portSlotIndex(left.fromOut) - portSlotIndex(right.fromOut) ||
        left.fromOut.localeCompare(right.fromOut),
    );
}

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
      parts.push({ kind: "scope", id: link.fromBlock });
      continue;
    }
    if (fromDef && isTransformerId(fromDef)) {
      const inner = walkConsumer(link.fromBlock, defOf, links, depth + 1);
      if (inner) {
        parts.push({ kind: "map", defId: fromDef, id: link.fromBlock, inner });
      }
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return { kind: "fork", inner: parts };
}

export function collectScopeIds(tree: ConsumerTree): number[] {
  return [...new Set(collectChannels(tree).map((channel) => channel.scopeId))];
}

export function collectChannels(tree: ConsumerTree, label = "out"): ScopeChannel[] {
  if (tree.kind === "scope") {
    return [{ scopeId: tree.id, label }];
  }
  if (tree.kind === "map") {
    return collectChannels(tree.inner, tree.defId);
  }
  return tree.inner.flatMap((child) => collectChannels(child, label));
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
  const channels = collectChannels(tree, node.defId);
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
  const emitFor = (tree: ConsumerTree, next = { n: 0 }): F64Func => {
    if (tree.kind === "scope") {
      const ring = next.n;
      next.n += 1;
      const leaf = buffers.get(ring);
      return (value) => leaf?.push(value);
    }
    if (tree.kind === "map") {
      const inner = emitFor(tree.inner, next);
      return (value) => inner(mapOnce(tree.defId, value));
    }
    return fork(...tree.inner.map((child) => emitFor(child, next)));
  };
  const sink = emitFor(plan.tree);
  return {
    emit: (time) => sink(sampleOnce(plan.defId, time)),
    delayMs: plan.delayMs,
  };
}

export function spawnTimer(compiled: CompiledTimer, running: { value: boolean }): () => void {
  const delay = Math.max(compiled.delayMs, 1);
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
