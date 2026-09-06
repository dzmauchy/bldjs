import type { BlockDef, BlockParameterDef, PortDef } from "../ast";
import type { Catalog } from "../catalog";
import type { Grounding } from "../resolve";
import { constraintToSpec, quoteAtom, typeToProlog, typeToSpec } from "./terms";

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

export function parentGoals(catalog: Catalog): string[] {
  const goals: string[] = [];
  for (const typeDef of catalog.typeDefs()) {
    for (const ancestor of typeDef.ancestors) {
      goals.push(`assert_parent(${quoteAtom(typeDef.name)}, ${typeToProlog(ancestor, new Set())})`);
      if (typeDef.ns) {
        goals.push(
          `assert_parent(${quoteAtom(`${typeDef.ns}.${typeDef.name}`)}, ${typeToProlog(ancestor, new Set())})`,
        );
      }
    }
  }
  return goals;
}

export function defineBlockGoal(block: BlockDef): string {
  const id = quoteAtom(block.id);
  const parts = [
    `retractall(block(${id}, _, _, _))`,
    `retractall(input(${id}, _, _, _, _))`,
    `retractall(output(${id}, _, _, _, _))`,
    `retractall(param(${id}, _, _, _))`,
    `assertz(${stripDot(blockFact(block))})`,
    ...block.inputs.map((port) => `assertz(${stripDot(portFact(block, port, "input"))})`),
    ...block.outputs.map((port) => `assertz(${stripDot(portFact(block, port, "output"))})`),
    ...block.parameters.map((param) => `assertz(${stripDot(paramFact(block, param))})`),
  ];
  return parts.join(",\n");
}

export function blockFact(block: BlockDef): string {
  const vars = new Set(block.vars.map((item) => item.name));
  const attrs: string[] = [];
  if (block.ns) {
    attrs.push(`ns(${quoteAtom(block.ns)})`);
  }
  for (const attribute of block.attributes) {
    if (attribute.value === "true") {
      attrs.push(quoteAtom(attribute.name));
    } else {
      attrs.push(`${quoteAtom(attribute.name)}(${quoteAtom(attribute.value)})`);
    }
  }
  for (const item of block.vars) {
    attrs.push(`var(${quoteAtom(item.name)}, ${constraintToSpec(item.constraint, vars)})`);
  }
  const icon = block.icon ? quoteAtom(block.icon) : "none";
  return `block(${quoteAtom(block.id)}, ${quoteAtom(block.name)}, ${icon}, [${attrs.join(", ")}]).`;
}

function portFact(block: BlockDef, port: PortDef, functor: "input" | "output"): string {
  const vars = new Set(block.vars.map((item) => item.name));
  const attrs: string[] = [];
  if (port.vararg) {
    attrs.push("vararg");
  }
  if (port.constraint) {
    attrs.push(`constraint(${constraintToSpec(port.constraint, vars)})`);
  }
  for (const attribute of port.attributes) {
    if (attribute.value === "true") {
      attrs.push(quoteAtom(attribute.name));
    }
  }
  return `${functor}(${quoteAtom(block.id)}, ${quoteAtom(port.name)}, ${quoteAtom(port.name)}, ${typeToSpec(port.ty, vars)}, [${attrs.join(", ")}]).`;
}

function paramFact(block: BlockDef, param: BlockParameterDef): string {
  const kind = param.kind.replace(/-parameter$/, "").replace(/-/g, "_");
  const attrs: string[] = [];
  if (param.description) {
    attrs.push(`description(${quoteAtom(param.description)})`);
  }
  if (param.default !== null) {
    attrs.push(`default(${quoteAtom(param.default)})`);
  }
  if (param.min !== undefined) {
    attrs.push(`min(${param.min})`);
  }
  if (param.max !== undefined) {
    attrs.push(`max(${param.max})`);
  }
  if (param.step !== undefined) {
    attrs.push(`step(${param.step})`);
  }
  if (param.pattern) {
    attrs.push(`pattern(${quoteAtom(param.pattern)})`);
  }
  return `param(${quoteAtom(block.id)}, ${quoteAtom(param.name)}, ${kind}, [${attrs.join(", ")}]).`;
}

function stripDot(fact: string): string {
  return fact.replace(/\.\s*$/, "");
}
