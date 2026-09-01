import type { GeneratorPlan, NodeSpec } from "@bld/xml/blocks/cs/types";
import { planGenerator } from "@bld/xml/blocks/cs/plan";
import type { Link } from "@bld/xml/blocks/diagram";
import { solutionViewFrom, type SolutionViewConnector } from "@bld/xml/solution/view";
import { assembleModule } from "./runtime/assemble";
import { WasmSolutionBuilder } from "./solution/wasm";

export interface CompiledGenerator extends GeneratorPlan {
  text: string;
  wasm: Uint8Array;
  connectors: readonly SolutionViewConnector[];
}

/** Run each XML-matching WASM builder block and wire SolutionViewConnectors. */
export async function assembleGenerator(
  plan: Pick<GeneratorPlan, "delayMs" | "generatorId" | "timerId">,
  nodes: NodeSpec[],
  links: Link[],
): Promise<{ wasm: Uint8Array; connectors: readonly SolutionViewConnector[] }> {
  const generatorId = plan.generatorId ?? plan.timerId;
  const assembled = await new WasmSolutionBuilder().build(solutionViewFrom(nodes, links), {
    delayMs: plan.delayMs,
    generatorId,
    emitText: false,
  });
  return { wasm: assembled.wasm, connectors: assembled.connectors };
}

/**
 * Walk Scope → Generator (sink flow), then generate WASM with Binaryen.
 * `runDiagram` does the same assemble step when the simulation starts.
 */
export async function compileGenerator(
  generatorId: number,
  nodes: NodeSpec[],
  links: Link[],
): Promise<CompiledGenerator | undefined> {
  const plan = planGenerator(generatorId, nodes, links);
  if (!plan) {
    return undefined;
  }
  const assembled = await new WasmSolutionBuilder().build(solutionViewFrom(nodes, links), {
    delayMs: plan.delayMs,
    generatorId: plan.generatorId,
  });
  return { ...plan, text: assembled.text, wasm: assembled.wasm, connectors: assembled.connectors };
}

/** Assemble the catalog block functions into one module and return WAT. */
export async function generatorText(generator: string | readonly string[] = "timer", delayMs = 0): Promise<string> {
  const id = typeof generator === "string" ? generator : (generator.at(-1) ?? "timer");
  return (await assembleModule({ generator: id, delayMs })).text;
}

/** @deprecated Prefer {@link generatorText}. */
export async function generatorWat(generator: string | readonly string[] = "timer", delayMs = 0): Promise<string> {
  return generatorText(generator, delayMs);
}
