import type { GeneratorPlan, NodeSpec } from "@bld/xml/blocks/cs/types";
import { planGenerator } from "@bld/xml/blocks/cs/plan";
import type { Link } from "@bld/xml/blocks/diagram";
import { solutionViewFrom, type SolutionViewConnector } from "@bld/xml/solution/view";
import { assembleModule } from "./runtime/assemble";
import { WasmSolutionBuilder } from "./solution/wasm";

export interface CompiledGenerator extends GeneratorPlan {
  text: string;
  wasm: Uint8Array;
  prodWasm: Uint8Array;
  connectors: readonly SolutionViewConnector[];
}

/** Run each XML-matching WASM builder block and wire SolutionViewConnectors. */
async function buildGenerator(
  plan: Pick<GeneratorPlan, "delayMs" | "generatorId" | "timerId">,
  nodes: NodeSpec[],
  links: Link[],
  emitText?: boolean,
) {
  const generatorId = plan.generatorId ?? plan.timerId;
  return new WasmSolutionBuilder().build(solutionViewFrom(nodes, links), {
    delayMs: plan.delayMs,
    generatorId,
    emitText,
  });
}

export async function assembleGenerator(
  plan: Pick<GeneratorPlan, "delayMs" | "generatorId" | "timerId">,
  nodes: NodeSpec[],
  links: Link[],
): Promise<{ wasm: Uint8Array; prodWasm: Uint8Array; connectors: readonly SolutionViewConnector[] }> {
  const assembled = await buildGenerator(plan, nodes, links, false);
  return { wasm: assembled.wasm, prodWasm: assembled.prodWasm, connectors: assembled.connectors };
}

/**
 * Walk Scope → transformers → Generator (sink flow), then compile MoonBit to
 * wasm-gc (browser) and linear wasm (MCU).
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
  const assembled = await buildGenerator(plan, nodes, links);
  return {
    ...plan,
    text: assembled.text,
    wasm: assembled.wasm,
    prodWasm: assembled.prodWasm,
    connectors: assembled.connectors,
  };
}

/** Assemble the catalog block functions into one module and return MoonBit source. */
export async function generatorText(generator: string | readonly string[] = "timer", delayMs = 0): Promise<string> {
  if (typeof generator === "string") {
    return (await assembleModule({ generator, delayMs })).text;
  }
  return (await assembleModule({ stages: generator, delayMs })).text;
}

/** @deprecated Prefer {@link generatorText}. */
export async function generatorWat(generator: string | readonly string[] = "timer", delayMs = 0): Promise<string> {
  return generatorText(generator, delayMs);
}
