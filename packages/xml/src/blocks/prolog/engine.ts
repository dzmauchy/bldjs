import { unbounded, type BlockDef, type TypeExpr, type VarDef } from "../ast";
import type { Catalog } from "../catalog";
import { quoteAtom, typeToProlog, prologTermToType } from "./terms";
import { defineBlockGoal, groundedTerm, parentGoals } from "./catalog-pl";
import type { Grounding } from "../resolve";
import typesPl from "./types.pl?raw";
import blocksPl from "./blocks.pl?raw";

export interface InferredPort {
  name: string;
  ty: TypeExpr;
  connectable: boolean;
}

export interface PrologInference {
  vars: Map<string, TypeExpr>;
  inputs: InferredPort[];
  outputs: InferredPort[];
  compatible: Map<string, boolean>;
}

type TreallaProlog = {
  consult(filename: string): Promise<void>;
  query(
    goal: string,
    options?: { autoyield?: number },
  ): AsyncGenerator<{
    status: string;
    answer?: Record<string, unknown>;
    error?: unknown;
    stdout?: string;
    stderr?: string;
  }>;
  fs: {
    open(path: string, options: { write?: boolean; create?: boolean }): { writeString(text: string): number };
  };
};

let enginePromise: Promise<TypeEngine> | undefined;

export function getTypeEngine(): Promise<TypeEngine> {
  return (enginePromise ??= TypeEngine.create());
}

export function resetTypeEngine(): void {
  enginePromise = undefined;
}

export class TypeEngine {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly pl: TreallaProlog) {}

  static async create(): Promise<TypeEngine> {
    const { load, Prolog } = await import("trealla");
    await load();
    const pl = new Prolog({ quiet: true }) as unknown as TreallaProlog;
    pl.fs.open("/type.pl", { write: true, create: true }).writeString(typesPl);
    await pl.consult("/type.pl");
    const loadedLib = await runGoal(pl, "use_module(type).");
    if (!loadedLib || loadedLib.status !== "success") {
      throw new Error("failed to load type.pl into Trealla");
    }
    pl.fs.open("/blocks.pl", { write: true, create: true }).writeString(blocksPl);
    await pl.consult("/blocks.pl");
    return new TypeEngine(pl);
  }

  async compatible(formal: TypeExpr, actual: TypeExpr, vars: readonly VarDef[] = []): Promise<boolean> {
    const names = new Set(vars.map((item) => item.name));
    const setup =
      vars.length === 0
        ? "true"
        : vars
            .map((item) => `setup_var(${item.name}, ${item.constraint ?? "none"})`)
            .join(", ");
    const goal = `
      ${setup},
      ( compatible(${typeToProlog(formal, names)}, ${typeToProlog(actual, names)}) -> Ok = true ; Ok = false ).
    `;
    const result = await this.run(goal);
    return !!result && result.status === "success" && isTrue(result.answer?.Ok);
  }

  async infer(block: BlockDef, grounded: Map<string, Grounding>, catalog: Catalog): Promise<PrologInference> {
    try {
      const vars = new Set(block.vars.map((item) => item.name));
      const parents = parentGoals(catalog);
      const parentGoal = parents.length > 0 ? `${parents.join(", ")},` : "";
      const id = quoteAtom(block.id);
      const goal = `
        ( once(block(${id}, _, _, _)) -> true ; (${defineBlockGoal(block)}) ),
        ${parentGoal}
        infer_block(${id}, ${groundedTerm(grounded, vars)}, Result).
      `;
      const result = await this.run(goal);
      if (!result || result.status !== "success" || !result.answer?.Result) {
        return failedInference(block);
      }
      return parseResult(block, result.answer.Result);
    } catch {
      enginePromise = undefined;
      return failedInference(block);
    }
  }

  private run(goal: string) {
    const next = this.queue.then(() => runGoal(this.pl, goal), () => runGoal(this.pl, goal));
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

async function runGoal(
  pl: TreallaProlog,
  goal: string,
): Promise<{
  status: string;
  answer?: Record<string, unknown>;
  error?: unknown;
} | undefined> {
  const q = pl.query(goal, { autoyield: 0 });
  let first: { status: string; answer?: Record<string, unknown>; error?: unknown } | undefined;
  for await (const answer of q) {
    if (!first) {
      first = answer;
    }
  }
  return first;
}

function isTrue(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (value && typeof value === "object" && "functor" in value) {
    return (value as { functor: string }).functor === "true";
  }
  return false;
}

function parseResult(block: BlockDef, result: unknown): PrologInference {
  const node = result as { functor?: string; args?: unknown[] };
  if (node.functor !== "result" || !node.args || node.args.length < 4) {
    return failedInference(block);
  }
  const [compatTerm, insTerm, outsTerm, varsTerm] = node.args;
  const compatible = new Map<string, boolean>();
  for (const item of asList(compatTerm)) {
    const compound = item as { functor?: string; args?: unknown[] };
    if (compound.functor === "compat" && compound.args && compound.args.length >= 2) {
      compatible.set(atomName(compound.args[0]), isTrue(compound.args[1]));
    }
  }
  const inputs: InferredPort[] = [];
  for (const item of asList(insTerm)) {
    const compound = item as { functor?: string; args?: unknown[] };
    if (compound.functor === "in" && compound.args && compound.args.length >= 2) {
      inputs.push({
        name: atomName(compound.args[0]),
        ty: prologTermToType(compound.args[1]),
        connectable: true,
      });
    }
  }
  const outputs: InferredPort[] = [];
  for (const item of asList(outsTerm)) {
    const compound = item as { functor?: string; args?: unknown[] };
    if (compound.functor === "out" && compound.args && compound.args.length >= 3) {
      outputs.push({
        name: atomName(compound.args[0]),
        ty: prologTermToType(compound.args[1]),
        connectable: isTrue(compound.args[2]),
      });
    }
  }
  const vars = new Map<string, TypeExpr>();
  for (const item of asList(varsTerm)) {
    const compound = item as { functor?: string; args?: unknown[] };
    if (compound.functor === "var" && compound.args && compound.args.length >= 2) {
      vars.set(atomName(compound.args[0]), prologTermToType(compound.args[1]));
    }
  }
  for (const port of block.inputs) {
    if (!compatible.has(port.name)) {
      compatible.set(port.name, true);
    }
  }
  return { vars, inputs, outputs, compatible };
}

function asList(term: unknown): unknown[] {
  return Array.isArray(term) ? term : [];
}

function atomName(term: unknown): string {
  if (typeof term === "string") {
    return term;
  }
  if (term && typeof term === "object" && "functor" in term) {
    return String((term as { functor: string }).functor);
  }
  return String(term);
}

function failedInference(block: BlockDef): PrologInference {
  return {
    vars: new Map(block.vars.map((item) => [item.name, unbounded()])),
    inputs: block.inputs.map((port) => ({ name: port.name, ty: port.ty, connectable: true })),
    outputs: block.outputs.map((port) => ({ name: port.name, ty: port.ty, connectable: false })),
    compatible: new Map(block.inputs.map((port) => [port.name, false])),
  };
}
