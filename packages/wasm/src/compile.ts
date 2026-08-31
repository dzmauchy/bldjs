import {
  type GeneratorPlan,
  type Link,
  type NodeSpec,
  type SolutionViewConnector,
  type Stage,
  planGenerator,
  solutionViewFrom,
} from "@bld/xml";
import { assembleModule } from "./runtime/assemble";
import { WasmSolutionBuilder } from "./solution/wasm";

export interface CompiledGenerator extends GeneratorPlan {
  text: string;
  wasm: Uint8Array;
  connectors: readonly SolutionViewConnector[];
}

/** Run each XML-matching WASM builder block and wire SolutionViewConnectors. */
export async function assembleGenerator(
  plan: Pick<GeneratorPlan, "delayMs" | "timerId">,
  nodes: NodeSpec[],
  links: Link[],
): Promise<{ wasm: Uint8Array; connectors: readonly SolutionViewConnector[] }> {
  const assembled = await new WasmSolutionBuilder().build(solutionViewFrom(nodes, links), {
    delayMs: plan.delayMs,
    timerId: plan.timerId,
    emitText: false,
  });
  return { wasm: assembled.wasm, connectors: assembled.connectors };
}

/**
 * Walk Scope → … → Timer (sink flow), then generate WASM with Binaryen.
 * `runDiagram` does the same assemble step when the simulation starts.
 */
export async function compileGenerator(
  timerId: number,
  nodes: NodeSpec[],
  links: Link[],
): Promise<CompiledGenerator | undefined> {
  const plan = planGenerator(timerId, nodes, links);
  if (!plan) {
    return undefined;
  }
  const assembled = await new WasmSolutionBuilder().build(solutionViewFrom(nodes, links), {
    delayMs: plan.delayMs,
    timerId: plan.timerId,
  });
  return { ...plan, text: assembled.text, wasm: assembled.wasm, connectors: assembled.connectors };
}

/** Assemble the catalog block functions into one module and return WAT. */
export async function generatorText(stages: readonly Stage[], delayMs = 0): Promise<string> {
  return (await assembleModule({ stages, delayMs })).text;
}

/** @deprecated Prefer {@link generatorText}. */
export async function generatorWat(stages: readonly Stage[], delayMs = 0): Promise<string> {
  return generatorText(stages, delayMs);
}
