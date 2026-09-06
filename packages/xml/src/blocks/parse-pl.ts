import {
  type Attribute,
  type BlockDef,
  type BlockParameterDef,
  type BlockParameterKind,
  type BlocksDoc,
  type Namespace,
  type PortDef,
  type TypeDef,
  type TypeExpr,
  type VarDef,
  isBlockParameterKind,
  named,
  unbounded,
  TupleType,
} from "./ast";
import { ParseError } from "../dom";
import { prologTermToType } from "./prolog/terms";

export type PlTerm = string | number | PlTerm[] | { functor: string; args: PlTerm[] };

export interface PlFact {
  functor: string;
  args: PlTerm[];
}

/** Split a Prolog source into facts, skipping comments, directives, and rules. */
export function parsePlFacts(src: string): PlFact[] {
  const body = stripComments(src);
  const facts: PlFact[] = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) {
      i += 1;
    }
    if (i >= body.length) {
      break;
    }
    if (body.startsWith(":-", i)) {
      i = skipTerm(body, i) + 1;
      continue;
    }
    const start = i;
    i = skipTerm(body, i);
    const chunk = body.slice(start, i).trim();
    if (body[i] === ".") {
      i += 1;
    }
    if (!chunk || chunk.includes(":-")) {
      continue;
    }
    const term = parseTerm(chunk, 0).value;
    if (typeof term === "object" && term !== null && !Array.isArray(term) && "functor" in term) {
      facts.push(term);
    }
  }
  return facts;
}

export function parsePlCatalog(file: string, src: string): BlocksDoc {
  const facts = parsePlFacts(src);
  const doc: BlocksDoc = {
    id: file.replace(/\.[^.]+$/, ""),
    name: file,
    icon: null,
    attributes: [],
    namespaces: [],
    types: [],
    blocks: [],
    source: file,
  };
  const typeByName = new Map<string, TypeDef>();
  const blockById = new Map<string, BlockDef>();

  for (const fact of facts) {
    switch (fact.functor) {
      case "catalog": {
        doc.id = atom(fact.args[0]);
        doc.name = atom(fact.args[1]);
        break;
      }
      case "ns": {
        doc.namespaces.push(parseNs(fact.args));
        break;
      }
      case "type": {
        const typeDef = parseTypeFact(fact.args, file);
        typeByName.set(typeDef.name, typeDef);
        doc.types.push(typeDef);
        break;
      }
      case "parent": {
        const child = atom(fact.args[0]);
        const parentTy = termToType(fact.args[1]);
        const existing = typeByName.get(child);
        if (existing) {
          existing.ancestors.push(parentTy);
        } else {
          const typeDef: TypeDef = {
            name: child,
            ns: null,
            vars: [],
            ancestors: [parentTy],
            alias: null,
            attributes: [],
            source: file,
          };
          typeByName.set(child, typeDef);
          doc.types.push(typeDef);
        }
        break;
      }
      case "var": {
        const owner = atom(fact.args[0]);
        const typeVar = parseVarFact(fact.args);
        typeByName.get(owner)?.vars.push(typeVar);
        blockById.get(owner)?.vars.push(typeVar);
        break;
      }
      case "block": {
        const block = parseBlockFact(fact.args, file);
        blockById.set(block.id, block);
        doc.blocks.push(block);
        break;
      }
      case "input": {
        blockById.get(atom(fact.args[0]))?.inputs.push(parsePortFact(fact.args, "in"));
        break;
      }
      case "output": {
        blockById.get(atom(fact.args[0]))?.outputs.push(parsePortFact(fact.args, "out"));
        break;
      }
      case "param": {
        const block = blockById.get(atom(fact.args[0]));
        if (block) {
          const param = parseParamFact(fact.args);
          block.parameters.push(param);
          block.settings = block.parameters;
        }
        break;
      }
      default:
        break;
    }
  }
  return doc;
}

function parseNs(args: PlTerm[]): Namespace {
  const parentTerm = args[2];
  let parent: string | null = null;
  if (parentTerm !== undefined && parentTerm !== "none") {
    parent = atom(parentTerm);
    if (parent === "none") {
      parent = null;
    }
  }
  return { id: atom(args[0]), name: atom(args[1]), parent, icon: null, attributes: [] };
}

function parseTypeFact(args: PlTerm[], file: string): TypeDef {
  return {
    name: atom(args[0]),
    ns: null,
    vars: [],
    ancestors: [],
    alias: null,
    attributes: args[1] !== undefined ? [{ name: "description", value: atom(args[1]) }] : [],
    source: file,
  };
}

function parseVarFact(args: PlTerm[]): VarDef {
  const constraintTerm = args[2];
  const constraint = constraintTerm !== undefined && constraintTerm !== "none" ? writeTerm(constraintTerm) : null;
  return { name: atom(args[1]), constraint, attributes: [] };
}

function parseBlockFact(args: PlTerm[], file: string): BlockDef {
  const attrs = asList(args[3]);
  const attributes: Attribute[] = [];
  const vars: VarDef[] = [];
  let ns = "";
  for (const item of attrs) {
    if (typeof item === "string") {
      attributes.push({ name: item, value: "true" });
      continue;
    }
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      if (item.functor === "ns") {
        ns = atom(item.args[0]);
      } else if (item.functor === "var") {
        const constraint = item.args[1] !== undefined && item.args[1] !== "none" ? writeTerm(item.args[1]) : null;
        vars.push({ name: atom(item.args[0]), constraint, attributes: [] });
      } else if (item.functor === "description" || item.functor === "kind") {
        attributes.push({ name: item.functor, value: atom(item.args[0]) });
      } else if (item.args.length === 1) {
        attributes.push({ name: item.functor, value: atom(item.args[0]) });
      } else {
        attributes.push({ name: item.functor, value: writeTerm(item) });
      }
    }
  }
  return {
    id: atom(args[0]),
    name: atom(args[1]),
    ns,
    icon: args[2] === "none" || args[2] === "" ? null : atom(args[2]),
    vars,
    parameters: [],
    settings: [],
    inputs: [],
    outputs: [],
    attributes,
    source: file,
  };
}

function parsePortFact(args: PlTerm[], direction: "in" | "out"): PortDef {
  const attrs = asList(args[4]);
  let vararg = false;
  let constraint: string | null = null;
  let icon: string | null = null;
  const attributes: Attribute[] = [];
  for (const item of attrs) {
    if (item === "vararg") {
      vararg = true;
    } else if (typeof item === "string") {
      attributes.push({ name: item, value: "true" });
    } else if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      if (item.functor === "constraint") {
        constraint = writeTerm(item.args[0]);
      } else if (item.functor === "icon") {
        icon = atom(item.args[0]);
      } else {
        attributes.push({
          name: item.functor,
          value: item.args[0] === undefined ? "true" : atom(item.args[0]),
        });
      }
    }
  }
  return {
    name: atom(args[2] ?? args[1]),
    ty: termToType(args[3]),
    constraint,
    vararg,
    icon,
    direction,
    attributes,
  };
}

function parseParamFact(args: PlTerm[]): BlockParameterDef {
  const kindAtom = atom(args[2]).replace(/_/g, "-");
  const kind: BlockParameterKind = isBlockParameterKind(kindAtom)
    ? kindAtom
    : isBlockParameterKind(`${kindAtom}-parameter`)
      ? (`${kindAtom}-parameter` as BlockParameterKind)
      : "setting";
  const attrs = asList(args[3]);
  let description: string | null = null;
  let defaultValue: string | null = null;
  let min: number | undefined;
  let max: number | undefined;
  let step: number | undefined;
  let minChars: number | undefined;
  let maxChars: number | undefined;
  let pattern: string | null = null;
  let type: TypeExpr | null = null;
  const attributes: Attribute[] = [];
  for (const item of attrs) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }
    const value = item.args[0];
    switch (item.functor) {
      case "description":
        description = atom(value);
        break;
      case "default":
        defaultValue = atom(value);
        break;
      case "min":
        min = Number(value);
        break;
      case "max":
        max = Number(value);
        break;
      case "step":
        step = Number(value);
        break;
      case "min_chars":
        minChars = Number(value);
        break;
      case "max_chars":
        maxChars = Number(value);
        break;
      case "pattern":
        pattern = atom(value);
        break;
      case "type":
        type = termToType(value);
        break;
      default:
        attributes.push({ name: item.functor, value: atom(value) });
    }
  }
  return {
    kind,
    name: atom(args[1]),
    type,
    description,
    default: defaultValue,
    min,
    max,
    step,
    minChars,
    maxChars,
    pattern,
    attributes,
  };
}

export function termToType(term: PlTerm | undefined): TypeExpr {
  if (term === undefined || term === "top" || term === "_") {
    return unbounded();
  }
  if (typeof term === "number") {
    return named(String(term));
  }
  if (typeof term === "string") {
    return named(term);
  }
  if (Array.isArray(term)) {
    return new TupleType(term.map(termToType));
  }
  return prologTermToType({ functor: term.functor, args: term.args.map(toPrologJson) });
}

function toPrologJson(term: PlTerm): unknown {
  if (typeof term === "string" || typeof term === "number") {
    return term;
  }
  if (Array.isArray(term)) {
    return term.map(toPrologJson);
  }
  return { functor: term.functor, args: term.args.map(toPrologJson) };
}

function atom(term: PlTerm | undefined): string {
  if (term === undefined) {
    return "";
  }
  if (typeof term === "string" || typeof term === "number") {
    return String(term);
  }
  if (Array.isArray(term)) {
    return writeTerm(term);
  }
  if (term.args.length === 0) {
    return term.functor;
  }
  return writeTerm(term);
}

function asList(term: PlTerm | undefined): PlTerm[] {
  if (term === undefined) {
    return [];
  }
  return Array.isArray(term) ? term : [term];
}

export function writeTerm(term: PlTerm): string {
  if (typeof term === "number") {
    return String(term);
  }
  if (typeof term === "string") {
    return /^[a-z][a-zA-Z0-9_]*$/.test(term) ? term : `'${term.replace(/'/g, "''")}'`;
  }
  if (Array.isArray(term)) {
    return `[${term.map(writeTerm).join(", ")}]`;
  }
  if (term.args.length === 0) {
    return term.functor;
  }
  return `${term.functor}(${term.args.map(writeTerm).join(", ")})`;
}

function stripComments(src: string): string {
  return src.replace(/%[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function skipTerm(src: string, start: number): number {
  let i = start;
  let depth = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i]!;
    if (quote) {
      if (ch === quote) {
        if (src[i + 1] === quote) {
          i += 2;
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "(" || ch === "[") {
      depth += 1;
    } else if (ch === ")" || ch === "]") {
      depth -= 1;
    } else if (ch === "." && depth === 0) {
      return i;
    }
    i += 1;
  }
  return i;
}

function parseTerm(src: string, index: number): { value: PlTerm; i: number } {
  let i = skipWs(src, index);
  if (src[i] === "[") {
    return parseList(src, i);
  }
  if (src[i] === "'") {
    const quoted = readQuoted(src, i);
    i = skipWs(src, quoted.i);
    if (src[i] === "(") {
      const args = parseArgs(src, i);
      return { value: { functor: quoted.value, args: args.value }, i: args.i };
    }
    return { value: quoted.value, i: quoted.i };
  }
  if (src[i] === "-" || (src[i] >= "0" && src[i] <= "9")) {
    const match = src.slice(i).match(/^-?\d+(?:\.\d+)?/);
    if (match) {
      return { value: Number(match[0]), i: i + match[0].length };
    }
  }
  const graphic = src.slice(i).match(/^[#$&*+\-\/:<=>?@^~\\]+/);
  if (graphic) {
    const functor = graphic[0]!;
    i = skipWs(src, i + functor.length);
    if (src[i] === "(") {
      const args = parseArgs(src, i);
      return { value: { functor, args: args.value }, i: args.i };
    }
    return { value: functor, i };
  }
  const match = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  if (!match) {
    throw ParseError.new(`invalid Prolog term at \`${src.slice(i, i + 24)}\``);
  }
  const functor = match[0];
  i = skipWs(src, i + functor.length);
  if (src[i] === "(") {
    const args = parseArgs(src, i);
    return { value: { functor, args: args.value }, i: args.i };
  }
  return { value: functor, i };
}

function parseList(src: string, index: number): { value: PlTerm[]; i: number } {
  let i = skipWs(src, index + 1);
  const items: PlTerm[] = [];
  if (src[i] === "]") {
    return { value: items, i: i + 1 };
  }
  while (i < src.length) {
    const item = parseTerm(src, i);
    items.push(item.value);
    i = skipWs(src, item.i);
    if (src[i] === ",") {
      i += 1;
      continue;
    }
    if (src[i] === "]") {
      return { value: items, i: i + 1 };
    }
    throw ParseError.new("invalid Prolog list");
  }
  throw ParseError.new("unterminated Prolog list");
}

function parseArgs(src: string, index: number): { value: PlTerm[]; i: number } {
  let i = skipWs(src, index + 1);
  const args: PlTerm[] = [];
  if (src[i] === ")") {
    return { value: args, i: i + 1 };
  }
  while (i < src.length) {
    const arg = parseTerm(src, i);
    args.push(arg.value);
    i = skipWs(src, arg.i);
    if (src[i] === ",") {
      i += 1;
      continue;
    }
    if (src[i] === ")") {
      return { value: args, i: i + 1 };
    }
    throw ParseError.new("invalid Prolog arguments");
  }
  throw ParseError.new("unterminated Prolog term");
}

function readQuoted(src: string, index: number): { value: string; i: number } {
  let i = index + 1;
  let out = "";
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "'") {
      if (src[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return { value: out, i: i + 1 };
    }
    out += ch;
    i += 1;
  }
  throw ParseError.new("unterminated Prolog atom");
}

function skipWs(src: string, index: number): number {
  let i = index;
  while (i < src.length && /\s/.test(src[i]!)) {
    i += 1;
  }
  return i;
}
