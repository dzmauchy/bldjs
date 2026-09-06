import { unbounded, type BlockDef, type TypeExpr, type VarDef } from "../ast";
import type { Catalog } from "../catalog";
import { portVar, quoteAtom, typeToProlog, prologTermToType } from "./terms";
import type { Grounding } from "../resolve";
import typesPl from "./types.pl?raw";

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
  queryOnce(
    goal: string,
    options?: { autoyield?: number },
  ): Promise<{
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

export class TypeEngine {
  private constructor(private readonly pl: TreallaProlog) {}

  static async create(): Promise<TypeEngine> {
    const { load, Prolog } = await import("trealla");
    await load();
    const pl = new Prolog({ quiet: true }) as unknown as TreallaProlog;
    pl.fs.open("/type.pl", { write: true, create: true }).writeString(typesPl);
    await pl.consult("/type.pl");
    const loaded = await pl.queryOnce("use_module(type).", { autoyield: 0 });
    if (loaded.status !== "success") {
      throw new Error("failed to load type.pl into Trealla");
    }
    return new TypeEngine(pl);
  }

  async compatible(formal: TypeExpr, actual: TypeExpr, vars: readonly VarDef[] = []): Promise<boolean> {
    const names = varNames(vars);
    const goal = `
      use_module(type),
      ${setupVars(vars)},
      ( compatible(${typeToProlog(formal, names)}, ${typeToProlog(actual, names)}) -> Ok = true ; Ok = false ).
    `;
    const result = await this.pl.queryOnce(goal, { autoyield: 0 });
    return result.status === "success" && isTrue(result.answer?.Ok);
  }

  async infer(block: BlockDef, grounded: Map<string, Grounding>, catalog: Catalog): Promise<PrologInference> {
    const goal = buildInferGoal(block, grounded, catalog);
    const result = await this.pl.queryOnce(goal, { autoyield: 0 });
    if (result.status !== "success" || !result.answer?.Result) {
      return failedInference(block);
    }
    return parseResult(block, result.answer.Result);
  }
}

function varNames(vars: readonly VarDef[]): Set<string> {
  return new Set(vars.map((item) => item.name));
}

function setupVars(vars: readonly VarDef[]): string {
  if (vars.length === 0) {
    return "true";
  }
  return vars
    .map((item) => {
      const constraint = item.constraint ?? "none";
      return `setup_var(${item.name}, ${constraint})`;
    })
    .join(",\n      ");
}

function buildInferGoal(block: BlockDef, grounded: Map<string, Grounding>, catalog: Catalog): string {
  const vars = varNames(block.vars);
  const ancestors = ancestorFacts(catalog);
  const parts: string[] = ["use_module(type)", "clear_ancestors"];
  if (ancestors.length > 0) {
    parts.push(`assert_ancestors([${ancestors.join(", ")}])`);
  }
  parts.push(setupVars(block.vars));

  for (const port of block.inputs) {
    const plVar = portVar("in", port.name);
    parts.push(`${plVar} = ${typeToProlog(port.ty, vars)}`);
    const grounding = grounded.get(port.name);
    const okVar = `Compat_${sanitize(port.name)}`;
    if (!grounding) {
      parts.push(`${okVar} = true`);
    } else if (grounding.kind === "single") {
      parts.push(
        `( constrain(${plVar}, ${typeToProlog(grounding.ty, vars)}) -> ${okVar} = true ; ${okVar} = false )`,
      );
    } else {
      const items = grounding.items.map((item) => typeToProlog(item, vars));
      if (items.length === 0) {
        parts.push(`${okVar} = true`);
      } else {
        const joins = items.map((item) => `constrain_join(${plVar}, ${item})`).join(", ");
        parts.push(`( (${joins}) -> ${okVar} = true ; ${okVar} = false )`);
      }
    }
  }

  for (const port of block.outputs) {
    const plVar = portVar("out", port.name);
    parts.push(`${plVar} = ${typeToProlog(port.ty, vars)}`);
  }

  parts.push(blockTypeGoal(block.typeProg));

  const outReads: string[] = [];
  for (const port of block.outputs) {
    const plVar = portVar("out", port.name);
    const tyVar = `TyOut_${sanitize(port.name)}`;
    const connVar = `Conn_${sanitize(port.name)}`;
    parts.push(`read_type(${plVar}, ${tyVar})`);
    parts.push(`( connectable(${plVar}) -> ${connVar} = true ; ${connVar} = false )`);
    outReads.push(`out(${quoteAtom(port.name)}, ${tyVar}, ${connVar})`);
  }

  const inReads: string[] = [];
  for (const port of block.inputs) {
    const plVar = portVar("in", port.name);
    const tyVar = `TyIn_${sanitize(port.name)}`;
    parts.push(`read_type(${plVar}, ${tyVar})`);
    inReads.push(`in(${quoteAtom(port.name)}, ${tyVar})`);
  }

  const varReads: string[] = [];
  for (const item of block.vars) {
    const tyVar = `TyVar_${item.name}`;
    parts.push(`read_type(${item.name}, ${tyVar})`);
    varReads.push(`var(${quoteAtom(item.name)}, ${tyVar})`);
  }

  const compatList = block.inputs
    .map((port) => `compat(${quoteAtom(port.name)}, Compat_${sanitize(port.name)})`)
    .join(", ");

  parts.push(
    `Result = result([${compatList}], [${inReads.join(", ")}], [${outReads.join(", ")}], [${varReads.join(", ")}])`,
  );

  return `${parts.join(",\n      ")}.`;
}

function blockTypeGoal(prog: string): string {
  const trimmed = prog.trim();
  if (trimmed.length === 0) {
    return "true";
  }
  return trimmed.replace(/\.\s*$/, "");
}

function ancestorFacts(catalog: Catalog): string[] {
  const facts: string[] = [];
  for (const typeDef of catalog.typeDefs()) {
    const names = [quoteAtom(typeDef.name)];
    if (typeDef.ns) {
      names.push(quoteAtom(`${typeDef.ns}.${typeDef.name}`));
    }
    for (const ancestor of typeDef.ancestors) {
      const parent = typeToProlog(ancestor, new Set());
      for (const child of names) {
        facts.push(`${child}-${parent}`);
      }
    }
  }
  return facts;
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
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
