import { VALTYPE, f32, f64, name, s32, s64, section, u32, vec } from "./binary";

export type Sexp = string | Sexp[];

interface FuncType {
  name: string;
  params: { name: string; type: string }[];
  results: { name: string; type: string }[];
}

interface Local {
  name: string;
  type: string;
}

interface FuncDef {
  name: string;
  typeName?: string;
  exportName?: string;
  params: Local[];
  results: { name: string; type: string }[];
  locals: Local[];
  body: Sexp[];
}

interface FuncImport {
  module: string;
  field: string;
  name: string;
  typeName?: string;
  params: Local[];
  results: { name: string; type: string }[];
}

interface MemImport {
  module: string;
  field: string;
  min: number;
  max?: number;
  shared: boolean;
}

interface ParsedModule {
  types: FuncType[];
  funcImports: FuncImport[];
  memImports: MemImport[];
  funcs: FuncDef[];
  exports: { name: string; func: string }[];
  elemFuncs: string[];
}

const MEMARG_DEFAULT_ALIGN: Record<string, number> = {
  "i32.load": 2,
  "i64.load": 3,
  "f32.load": 2,
  "f64.load": 3,
  "i32.store": 2,
  "i64.store": 3,
  "f32.store": 2,
  "f64.store": 3,
  "memory.atomic.wait32": 2,
  "i32.atomic.load": 2,
};

const SIMPLE: Record<string, number> = {
  unreachable: 0x00,
  nop: 0x01,
  return: 0x0f,
  drop: 0x1a,
  "i32.eqz": 0x45,
  "i32.eq": 0x46,
  "i32.ne": 0x47,
  "i32.lt_s": 0x48,
  "i32.lt_u": 0x49,
  "i32.gt_s": 0x4a,
  "i32.gt_u": 0x4b,
  "i32.le_s": 0x4c,
  "i32.le_u": 0x4d,
  "i32.ge_s": 0x4e,
  "i32.ge_u": 0x4f,
  "i64.eqz": 0x50,
  "i64.eq": 0x51,
  "i64.ne": 0x52,
  "i64.lt_s": 0x53,
  "i64.lt_u": 0x54,
  "i64.gt_s": 0x55,
  "i64.gt_u": 0x56,
  "i64.le_s": 0x57,
  "i64.le_u": 0x58,
  "i64.ge_s": 0x59,
  "i64.ge_u": 0x5a,
  "i32.add": 0x6a,
  "i32.sub": 0x6b,
  "i32.mul": 0x6c,
  "i32.div_s": 0x6d,
  "i32.div_u": 0x6e,
  "i32.rem_s": 0x6f,
  "i32.rem_u": 0x70,
  "i32.and": 0x71,
  "i32.or": 0x72,
  "i32.xor": 0x73,
  "i64.add": 0x7c,
  "i64.sub": 0x7d,
  "i64.mul": 0x7e,
};

export function stripComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith(";;", i)) {
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (text.startsWith("(;", i)) {
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text.startsWith("(;", i)) {
          depth += 1;
          i += 2;
        } else if (text.startsWith(";)", i)) {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const src = stripComments(text);
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\") {
          j += 2;
        } else {
          j += 1;
        }
      }
      tokens.push(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < src.length && !/\s|[()]/.test(src[j])) {
      j += 1;
    }
    tokens.push(src.slice(i, j));
    i = j;
  }
  return tokens;
}

export function parseSexps(text: string): Sexp[] {
  const tokens = tokenize(text);
  let i = 0;
  const read = (): Sexp => {
    const tok = tokens[i++];
    if (tok === undefined) {
      throw new Error("unexpected end of WAT");
    }
    if (tok === "(") {
      const list: Sexp[] = [];
      while (tokens[i] !== ")") {
        if (tokens[i] === undefined) {
          throw new Error("unclosed list in WAT");
        }
        list.push(read());
      }
      i += 1;
      return list;
    }
    if (tok === ")") {
      throw new Error("unexpected ) in WAT");
    }
    return tok;
  };
  const out: Sexp[] = [];
  while (i < tokens.length) {
    out.push(read());
  }
  return out;
}

function atom(node: Sexp): string {
  if (typeof node !== "string") {
    throw new Error(`expected atom, got list`);
  }
  return node;
}

function list(node: Sexp): Sexp[] {
  if (!Array.isArray(node)) {
    throw new Error(`expected list, got ${node}`);
  }
  return node;
}

function head(node: Sexp): string {
  const items = list(node);
  return atom(items[0]);
}

function unquote(token: string): string {
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }
  return token;
}

function idName(token: string): string {
  return token.startsWith("$") ? token.slice(1) : token;
}

function parsePort(node: Sexp): { name: string; type: string } {
  const items = list(node);
  const kind = atom(items[0]);
  if (kind !== "param" && kind !== "result" && kind !== "local") {
    throw new Error(`expected param/result/local, got ${kind}`);
  }
  if (items.length === 2) {
    return { name: "", type: typeText(items[1]) };
  }
  return { name: idName(atom(items[1])), type: typeText(items[2]) };
}

function typeText(node: Sexp): string {
  if (typeof node === "string") {
    return node;
  }
  return `(${list(node).map((part) => (typeof part === "string" ? part : typeText(part))).join(" ")})`;
}

function parseFuncType(items: Sexp[], fallbackName: string): FuncType {
  const params: FuncType["params"] = [];
  const results: FuncType["results"] = [];
  let name = fallbackName;
  for (const item of items) {
    if (typeof item === "string") {
      if (item.startsWith("$")) {
        name = idName(item);
      }
      continue;
    }
    const kind = head(item);
    if (kind === "param") {
      params.push(parsePort(item));
    } else if (kind === "result") {
      results.push(parsePort(item));
    }
  }
  return { name, params, results };
}

function parseFunc(items: Sexp[]): FuncDef {
  const fn: FuncDef = {
    name: "",
    params: [],
    results: [],
    locals: [],
    body: [],
  };
  for (const item of items.slice(1)) {
    if (typeof item === "string") {
      if (item.startsWith("$") && !fn.name) {
        fn.name = idName(item);
      }
      continue;
    }
    const kind = head(item);
    if (kind === "export") {
      fn.exportName = unquote(atom(list(item)[1]));
    } else if (kind === "type") {
      fn.typeName = idName(atom(list(item)[1]));
    } else if (kind === "param") {
      fn.params.push(parsePort(item));
    } else if (kind === "result") {
      fn.results.push(parsePort(item));
    } else if (kind === "local") {
      fn.locals.push(parsePort(item));
    } else {
      fn.body.push(item);
    }
  }
  if (!fn.name) {
    fn.name = `f${Math.random().toString(36).slice(2)}`;
  }
  return fn;
}

function parseImport(items: Sexp[]): FuncImport | { memory: MemImport } {
  const module = unquote(atom(items[1]));
  const field = unquote(atom(items[2]));
  const desc = list(items[3]);
  const kind = atom(desc[0]);
  if (kind === "memory") {
    const nums = desc.filter((part): part is string => typeof part === "string" && part !== "memory" && part !== "shared");
    return {
      memory: {
        module,
        field,
        min: Number(nums[0] ?? 1),
        max: nums[1] !== undefined ? Number(nums[1]) : undefined,
        shared: desc.includes("shared"),
      },
    };
  }
  if (kind !== "func") {
    throw new Error(`unsupported import ${kind}`);
  }
  const parsed = parseFunc(desc);
  return {
    module,
    field,
    name: parsed.name || field,
    typeName: parsed.typeName,
    params: parsed.params,
    results: parsed.results,
  };
}

function parseModule(root: Sexp): ParsedModule {
  const items = list(root);
  if (atom(items[0]) !== "module") {
    throw new Error("WAT root must be (module …)");
  }
  const mod: ParsedModule = {
    types: [],
    funcImports: [],
    memImports: [],
    funcs: [],
    exports: [],
    elemFuncs: [],
  };
  for (const child of items.slice(1)) {
    if (typeof child === "string") {
      continue;
    }
    const kind = head(child);
    const parts = list(child);
    if (kind === "type") {
      const typeName = idName(atom(parts[1]));
      const func = list(parts[2]);
      if (atom(func[0]) !== "func") {
        throw new Error(`unsupported type ${typeName}`);
      }
      mod.types.push(parseFuncType(func.slice(1), typeName));
    } else if (kind === "import") {
      const imported = parseImport(parts);
      if ("memory" in imported) {
        mod.memImports.push(imported.memory);
      } else {
        mod.funcImports.push(imported);
      }
    } else if (kind === "func") {
      const fn = parseFunc(parts);
      mod.funcs.push(fn);
      if (fn.exportName) {
        mod.exports.push({ name: fn.exportName, func: fn.name });
      }
    } else if (kind === "export") {
      const exportName = unquote(atom(parts[1]));
      const desc = list(parts[2]);
      if (atom(desc[0]) === "func") {
        mod.exports.push({ name: exportName, func: idName(atom(desc[1])) });
      }
    } else if (kind === "elem") {
      const names = parts
        .slice(1)
        .filter((part): part is string => typeof part === "string" && part.startsWith("$"))
        .map(idName);
      if (parts.some((part) => typeof part === "string" && part === "func")) {
        const idx = parts.findIndex((part) => part === "func");
        for (const part of parts.slice(idx + 1)) {
          if (typeof part === "string" && part.startsWith("$")) {
            names.push(idName(part));
          }
        }
      }
      mod.elemFuncs.push(...names);
    }
  }
  return mod;
}

function typeKey(params: { type: string }[], results: { type: string }[]): string {
  return `${params.map((p) => p.type).join(",")}>${results.map((r) => r.type).join(",")}`;
}

function encodeValType(type: string): number[] {
  const primitive = VALTYPE[type];
  if (primitive !== undefined) {
    return [primitive];
  }
  throw new Error(`unsupported valtype ${type}`);
}

function encodeFuncType(type: FuncType): number[] {
  return [
    0x60,
    ...u32(type.params.length),
    ...type.params.flatMap((port) => encodeValType(port.type)),
    ...u32(type.results.length),
    ...type.results.flatMap((port) => encodeValType(port.type)),
  ];
}

interface Resolve {
  typeIdx: Map<string, number>;
  funcIdx: Map<string, number>;
  types: FuncType[];
}

function resolveModule(mod: ParsedModule): Resolve {
  const types: FuncType[] = [...mod.types];
  const typeIdx = new Map<string, number>();
  const byKey = new Map<string, number>();
  types.forEach((type, i) => {
    typeIdx.set(type.name, i);
    byKey.set(typeKey(type.params, type.results), i);
  });

  const intern = (nameHint: string, params: Local[], results: { name: string; type: string }[]): number => {
    const key = typeKey(params, results);
    const existing = byKey.get(key);
    if (existing !== undefined) {
      if (nameHint && !typeIdx.has(nameHint)) {
        typeIdx.set(nameHint, existing);
      }
      return existing;
    }
    const idx = types.length;
    const named = { name: nameHint || `t${idx}`, params, results };
    types.push(named);
    byKey.set(key, idx);
    if (named.name) {
      typeIdx.set(named.name, idx);
    }
    return idx;
  };

  for (const imported of mod.funcImports) {
    if (imported.typeName && typeIdx.has(imported.typeName)) {
      continue;
    }
    intern(imported.typeName ?? imported.name, imported.params, imported.results);
  }
  for (const fn of mod.funcs) {
    if (fn.typeName && typeIdx.has(fn.typeName)) {
      continue;
    }
    intern(fn.typeName ?? fn.name, fn.params, fn.results);
  }

  const funcIdx = new Map<string, number>();
  let next = 0;
  for (const imported of mod.funcImports) {
    funcIdx.set(imported.name, next++);
  }
  for (const fn of mod.funcs) {
    funcIdx.set(fn.name, next++);
  }
  return { typeIdx, funcIdx, types };
}

function parseMemarg(op: string, nodes: Sexp[]): { offset: number; align: number; args: Sexp[] } {
  let offset = 0;
  let align = MEMARG_DEFAULT_ALIGN[op] ?? 0;
  const args: Sexp[] = [];
  for (const node of nodes) {
    if (typeof node === "string" && node.startsWith("offset=")) {
      offset = Number(node.slice("offset=".length));
    } else if (typeof node === "string" && node.startsWith("align=")) {
      align = Number(node.slice("align=".length));
    } else {
      args.push(node);
    }
  }
  return { offset, align, args };
}

function encodeInstr(
  node: Sexp,
  ctx: {
    locals: Map<string, number>;
    labels: string[];
    resolve: Resolve;
  },
): number[] {
  if (typeof node === "string") {
    const simple = SIMPLE[node];
    if (simple !== undefined) {
      return [simple];
    }
    throw new Error(`unsupported instruction ${node}`);
  }
  const items = list(node);
  const op = atom(items[0]);
  const rest = items.slice(1);

  const emitArgs = (args: Sexp[]): number[] => args.flatMap((arg) => encodeInstr(arg, ctx));

  if (op === "local.get" || op === "local.set" || op === "local.tee") {
    const localName = idName(atom(rest[0]));
    const idx = ctx.locals.get(localName);
    if (idx === undefined) {
      throw new Error(`unknown local $${localName}`);
    }
    const code = op === "local.get" ? 0x20 : op === "local.set" ? 0x21 : 0x22;
    const value = rest.length > 1 ? emitArgs(rest.slice(1)) : [];
    return [...value, code, ...u32(idx)];
  }
  if (op === "i32.const") {
    return [0x41, ...s32(Number(atom(rest[0])))];
  }
  if (op === "i64.const") {
    return [0x42, ...s64(BigInt(atom(rest[0])))];
  }
  if (op === "f32.const") {
    return [0x43, ...f32(Number(atom(rest[0])))];
  }
  if (op === "f64.const") {
    return [0x44, ...f64(Number(atom(rest[0])))];
  }
  if (
    op === "i32.load" ||
    op === "i64.load" ||
    op === "f32.load" ||
    op === "f64.load" ||
    op === "i32.store" ||
    op === "i64.store" ||
    op === "f32.store" ||
    op === "f64.store" ||
    op === "memory.atomic.wait32" ||
    op === "i32.atomic.load"
  ) {
    const { offset, align, args } = parseMemarg(op, rest);
    const opcode =
      op === "i32.load"
        ? [0x28]
        : op === "i64.load"
          ? [0x29]
          : op === "f32.load"
            ? [0x2a]
            : op === "f64.load"
              ? [0x2b]
              : op === "i32.store"
                ? [0x36]
                : op === "i64.store"
                  ? [0x37]
                  : op === "f32.store"
                    ? [0x38]
                    : op === "f64.store"
                      ? [0x39]
                      : op === "memory.atomic.wait32"
                        ? [0xfe, 0x01]
                        : [0xfe, 0x10];
    return [...emitArgs(args), ...opcode, ...u32(align), ...u32(offset)];
  }
  if (op === "call") {
    const fn = idName(atom(rest[0]));
    const idx = ctx.resolve.funcIdx.get(fn);
    if (idx === undefined) {
      throw new Error(`unknown func $${fn}`);
    }
    return [...emitArgs(rest.slice(1)), 0x10, ...u32(idx)];
  }
  if (op === "call_ref") {
    const typeName = idName(atom(rest[0]));
    const idx = ctx.resolve.typeIdx.get(typeName);
    if (idx === undefined) {
      throw new Error(`unknown type $${typeName}`);
    }
    return [...emitArgs(rest.slice(1)), 0x14, ...u32(idx)];
  }
  if (op === "ref.func") {
    const fn = idName(atom(rest[0]));
    const idx = ctx.resolve.funcIdx.get(fn);
    if (idx === undefined) {
      throw new Error(`unknown func $${fn}`);
    }
    return [0xd2, ...u32(idx)];
  }
  if (op === "if") {
    const body = rest.filter((item) => typeof item !== "string" || !item.startsWith("$"));
    let cond: Sexp | undefined;
    let thenBody: Sexp[] = [];
    let elseBody: Sexp[] = [];
    for (const item of body) {
      if (typeof item === "string") {
        continue;
      }
      if (head(item) === "then") {
        thenBody = list(item).slice(1);
      } else if (head(item) === "else") {
        elseBody = list(item).slice(1);
      } else if (!cond) {
        cond = item;
      }
    }
    ctx.labels.unshift("");
    const encoded = [
      ...(cond ? encodeInstr(cond, ctx) : []),
      0x04,
      0x40,
      ...thenBody.flatMap((item) => encodeInstr(item, ctx)),
      ...(elseBody.length ? [0x05, ...elseBody.flatMap((item) => encodeInstr(item, ctx))] : []),
      0x0b,
    ];
    ctx.labels.shift();
    return encoded;
  }
  if (op === "loop" || op === "block") {
    const label = typeof rest[0] === "string" && rest[0].startsWith("$") ? idName(rest[0]) : "";
    const body = typeof rest[0] === "string" && rest[0].startsWith("$") ? rest.slice(1) : rest;
    ctx.labels.unshift(label);
    const encoded = [op === "loop" ? 0x03 : 0x02, 0x40, ...body.flatMap((item) => encodeInstr(item, ctx)), 0x0b];
    ctx.labels.shift();
    return encoded;
  }
  if (op === "br" || op === "br_if") {
    const label = idName(atom(rest[0]));
    const depth = ctx.labels.indexOf(label);
    if (depth < 0) {
      throw new Error(`unknown label $${label}`);
    }
    return [...emitArgs(rest.slice(1)), op === "br" ? 0x0c : 0x0d, ...u32(depth)];
  }
  const simple = SIMPLE[op];
  if (simple !== undefined) {
    return [...emitArgs(rest), simple];
  }
  throw new Error(`unsupported instruction ${op}`);
}

function encodeLocals(locals: Local[]): number[] {
  if (locals.length === 0) {
    return [0x00];
  }
  const groups: { type: string; count: number }[] = [];
  for (const local of locals) {
    const last = groups.at(-1);
    if (last && last.type === local.type) {
      last.count += 1;
    } else {
      groups.push({ type: local.type, count: 1 });
    }
  }
  return [
    ...u32(groups.length),
    ...groups.flatMap((group) => [...u32(group.count), ...encodeValType(group.type)]),
  ];
}

function encodeFunc(fn: FuncDef, resolve: Resolve): number[] {
  const locals = new Map<string, number>();
  [...fn.params, ...fn.locals].forEach((local, i) => {
    if (local.name) {
      locals.set(local.name, i);
    }
  });
  const code = fn.body.flatMap((item) => encodeInstr(item, { locals, labels: [], resolve }));
  const inner = [...encodeLocals(fn.locals), ...code, 0x0b];
  return [...u32(inner.length), ...inner];
}

/** Compile a WAT module (the assembled generator) to wasm-gc + threads. */
export function compileWat(wat: string): Uint8Array {
  const roots = parseSexps(wat);
  const moduleNode = roots.find((node) => Array.isArray(node) && node[0] === "module");
  if (!moduleNode) {
    throw new Error("WAT did not contain a module");
  }
  const mod = parseModule(moduleNode);
  const resolve = resolveModule(mod);

  const types = section(1, vec(resolve.types.map(encodeFuncType)));

  const importEntries: number[][] = [];
  for (const memory of mod.memImports) {
    const limits = memory.shared
      ? [0x03, ...u32(memory.min), ...u32(memory.max ?? memory.min)]
      : memory.max !== undefined
        ? [0x01, ...u32(memory.min), ...u32(memory.max)]
        : [0x00, ...u32(memory.min)];
    importEntries.push([...name(memory.module), ...name(memory.field), 0x02, ...limits]);
  }
  for (const imported of mod.funcImports) {
    const idx = imported.typeName
      ? resolve.typeIdx.get(imported.typeName)
      : resolve.typeIdx.get(imported.name);
    if (idx === undefined) {
      throw new Error(`import ${imported.name} is missing a type`);
    }
    importEntries.push([...name(imported.module), ...name(imported.field), 0x00, ...u32(idx)]);
  }
  const imports = section(2, vec(importEntries));

  const functions = section(
    3,
    vec(
      mod.funcs.map((fn) => {
        const idx = fn.typeName ? resolve.typeIdx.get(fn.typeName) : undefined;
        const resolved = idx ?? resolve.typeIdx.get(fn.name);
        if (resolved === undefined) {
          throw new Error(`func $${fn.name} is missing a type`);
        }
        return u32(resolved);
      }),
    ),
  );

  const exports = section(
    7,
    vec(mod.exports.map((item) => [...name(item.name), 0x00, ...u32(mustGet(resolve.funcIdx, item.func))])),
  );

  const uniqueElems = [...new Set(mod.elemFuncs)];
  const elems =
    uniqueElems.length > 0
      ? section(9, [0x01, 0x03, 0x00, ...vec(uniqueElems.map((fn) => u32(mustGet(resolve.funcIdx, fn))))])
      : [];

  const code = section(10, vec(mod.funcs.map((fn) => encodeFunc(fn, resolve))));

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...types,
    ...imports,
    ...functions,
    ...exports,
    ...elems,
    ...code,
  ]);
}

function mustGet(map: Map<string, number>, key: string): number {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`unknown name ${key}`);
  }
  return value;
}
