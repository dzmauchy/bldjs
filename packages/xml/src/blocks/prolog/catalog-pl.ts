import type { BlockDef } from "../ast";
import type { Catalog } from "../catalog";
import type { Grounding } from "../resolve";
import { constraintToSpec, quoteAtom, typeToProlog, typeToSpec } from "./terms";

/** Prolog file consulted after `types.pl` + `blocks.pl`. Facts are keyed by block id. */
export function catalogPl(catalog: Catalog): string {
  const asserts = catalog.blocks().map((block) => `:- assertz(${stripDot(blockFact(block))}).`);
  const ancestors = ancestorFacts(catalog);
  const ancestorDir =
    ancestors.length === 0
      ? ":- clear_ancestors."
      : `:- clear_ancestors.\n:- assert_ancestors([${ancestors.join(", ")}]).`;
  return [":- use_module(type).", ":- retractall(block(_, _, _, _)).", ...asserts, ancestorDir, ""].join("\n");
}

export function groundedTerm(grounded: Map<string, Grounding>, vars: ReadonlySet<string>): string {
  const items: string[] = [];
  for (const [name, item] of grounded) {
    if (item.kind === "single") {
      items.push(`g(${quoteAtom(name)}, single, ${typeToProlog(item.ty, vars)})`);
    } else {
      const list = item.items.map((ty) => typeToProlog(ty, vars)).join(", ");
      items.push(`g(${quoteAtom(name)}, join, [${list}])`);
    }
  }
  return `[${items.join(", ")}]`;
}

export function ancestorFacts(catalog: Catalog): string[] {
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

export function blockFact(block: BlockDef): string {
  const vars = new Set(block.vars.map((item) => item.name));
  const varList = block.vars
    .map((item) => `var(${quoteAtom(item.name)}, ${constraintToSpec(item.constraint, vars)})`)
    .join(", ");
  const ins = block.inputs
    .map((port) => {
      const flag = port.vararg ? "vararg" : "once";
      return `in(${quoteAtom(port.name)}, ${typeToSpec(port.ty, vars)}, ${constraintToSpec(port.constraint, vars)}, ${flag})`;
    })
    .join(", ");
  const outs = block.outputs
    .map(
      (port) =>
        `out(${quoteAtom(port.name)}, ${typeToSpec(port.ty, vars)}, ${constraintToSpec(port.constraint, vars)})`,
    )
    .join(", ");
  return `block(${quoteAtom(block.id)}, [${varList}], [${ins}], [${outs}]).`;
}

function stripDot(fact: string): string {
  return fact.replace(/\.\s*$/, "");
}
