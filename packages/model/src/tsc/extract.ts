import {
  type Attribute,
  type BlockDef,
  type BlockParameterDef,
  type BlocksDoc,
  type Factory,
  type Namespace,
  type ParamDef,
  type PortDef,
  type TypeDef,
  type TypeExpr,
  isBlockParameterKind,
  named,
} from "@bld/types/ast";
import {
  isArrayLiteralExpression,
  isCallExpression,
  isClassDeclaration,
  isDecorator,
  isExpressionStatement,
  isFalseLiteral,
  isFunctionDeclaration,
  isIdentifier,
  isModuleBlock,
  isModuleDeclaration,
  isNamedTupleMember,
  isNumericLiteral,
  isObjectLiteralExpression,
  isPrefixUnaryExpression,
  isPropertyAssignment,
  isStringLiteral,
  isTrueLiteral,
  isTypeAliasDeclaration,
  isTypeParameterDeclaration,
  type CallExpression,
  type ClassDeclaration,
  type Expression,
  type FunctionDeclaration,
  type ModuleDeclaration,
  type Node,
  type ObjectLiteralExpression,
  type SourceFile,
  type TypeAliasDeclaration,
} from "typescript/unstable/ast";
import { PRELUDE_FILE } from "./prelude";
import { type TscContext, VIRTUAL_ROOT } from "./host";
import { registerCheckerType } from "./types";

type Meta = Record<string, unknown>;

function identText(node: Node | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (isIdentifier(node)) {
    return node.text;
  }
  if (isStringLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function evalLiteral(node: Node | undefined): unknown {
  if (!node) {
    return undefined;
  }
  if (isStringLiteral(node)) {
    return node.text;
  }
  if (isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (isTrueLiteral(node)) {
    return true;
  }
  if (isFalseLiteral(node)) {
    return false;
  }
  if (isPrefixUnaryExpression(node) && isNumericLiteral(node.operand)) {
    const value = Number(node.operand.text);
    return node.getText().trim().startsWith("-") ? -value : value;
  }
  if (isArrayLiteralExpression(node)) {
    return node.elements.map((element) => evalLiteral(element));
  }
  if (isObjectLiteralExpression(node)) {
    return objectMeta(node);
  }
  if (isIdentifier(node) && (node.text === "undefined" || node.text === "null")) {
    return undefined;
  }
  return undefined;
}

function objectMeta(node: ObjectLiteralExpression): Meta {
  const meta: Meta = {};
  for (const prop of node.properties) {
    if (!isPropertyAssignment(prop)) {
      continue;
    }
    const key = identText(prop.name);
    if (!key) {
      continue;
    }
    meta[key] = evalLiteral(prop.initializer);
  }
  return meta;
}

function decoratorCallName(expr: Expression): string | undefined {
  if (isIdentifier(expr)) {
    return expr.text;
  }
  if (isCallExpression(expr) && isIdentifier(expr.expression)) {
    return expr.expression.text;
  }
  return undefined;
}

function classDecorators(node: ClassDeclaration): Array<{ name: string; meta: Meta }> {
  const found: Array<{ name: string; meta: Meta }> = [];
  for (const modifier of node.modifiers ?? []) {
    if (!isDecorator(modifier)) {
      continue;
    }
    const expr = modifier.expression;
    if (isCallExpression(expr) && isIdentifier(expr.expression)) {
      const arg = expr.arguments[0];
      found.push({
        name: expr.expression.text,
        meta: arg && isObjectLiteralExpression(arg) ? objectMeta(arg) : {},
      });
    }
  }
  return found;
}

function unwrapDecoratorCalls(
  expr: Expression,
): { fnName: string; layers: Array<{ name: string; meta: Meta }> } | undefined {
  const layers: Array<{ name: string; meta: Meta }> = [];
  let current: Expression = expr;
  while (isCallExpression(current)) {
    const callee = current.expression;
    if (isCallExpression(callee) && isIdentifier(callee.expression)) {
      const arg = callee.arguments[0];
      layers.push({
        name: callee.expression.text,
        meta: arg && isObjectLiteralExpression(arg) ? objectMeta(arg) : {},
      });
      const inner = current.arguments[0];
      if (!inner) {
        return undefined;
      }
      current = inner;
      continue;
    }
    if (isIdentifier(callee) && current.arguments.length === 1) {
      layers.push({ name: callee.text, meta: {} });
      const inner = current.arguments[0];
      if (!inner) {
        return undefined;
      }
      current = inner;
      continue;
    }
    break;
  }
  const fnName = identText(current);
  if (!fnName || layers.length === 0) {
    return undefined;
  }
  return { fnName, layers };
}

function attrsFromMeta(meta: Meta | undefined): Attribute[] {
  if (!meta) {
    return [];
  }
  const extra: Attribute[] = [];
  const nested = meta.attrs;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const [name, value] of Object.entries(nested as Record<string, unknown>)) {
      extra.push({ name, value: String(value) });
    }
  }
  return extra;
}

function flagAttrs(meta: Meta, keys: readonly string[]): Attribute[] {
  const extra: Attribute[] = [];
  for (const key of keys) {
    if (meta[key] !== undefined) {
      extra.push({ name: key, value: String(meta[key]) });
    }
  }
  return [...extra, ...attrsFromMeta(meta)];
}

function str(meta: Meta, key: string, fallback?: string): string | undefined {
  const value = meta[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return fallback;
}

function num(meta: Meta, key: string): number | undefined {
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sourceName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const root = `${VIRTUAL_ROOT}/`;
  if (normalized.startsWith(root)) {
    return normalized.slice(root.length);
  }
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function matchesFile(sf: SourceFile, file: string): boolean {
  const name = sourceName(sf.fileName);
  return name === file || sf.fileName.endsWith(`/${file}`);
}

function moduleNameText(node: ModuleDeclaration): string {
  return identText(node.name) ?? node.name.getText();
}

function paramDefs(node: FunctionDeclaration | TypeAliasDeclaration | ClassDeclaration): ParamDef[] {
  return (node.typeParameters ?? []).filter(isTypeParameterDeclaration).map((param) => ({
    name: param.name.text,
    extends: [],
    attributes: [],
  }));
}

function portFromMeta(name: string, ty: TypeExpr, direction: "in" | "out", meta: Meta | undefined, vararg = false): PortDef {
  const portMeta = meta ?? {};
  const nestedAttrs = attrsFromMeta(portMeta);
  return {
    name: str(portMeta, "name", name) ?? name,
    ty,
    vararg: portMeta.vararg === true || vararg,
    icon: str(portMeta, "icon") ?? null,
    direction,
    attributes: nestedAttrs,
  };
}

function parameterFromMeta(key: string, meta: Meta): BlockParameterDef {
  const kindRaw = str(meta, "kind") ?? "parameter";
  const kind = isBlockParameterKind(kindRaw) ? kindRaw : "parameter";
  const fallback = meta.default === undefined || meta.default === null ? null : String(meta.default);
  return {
    kind,
    name: str(meta, "name", key) ?? key,
    type: null,
    description: str(meta, "description") ?? null,
    default: fallback,
    min: num(meta, "min"),
    max: num(meta, "max"),
    step: num(meta, "step"),
    minChars: num(meta, "minChars"),
    maxChars: num(meta, "maxChars"),
    pattern: str(meta, "pattern") ?? null,
    attributes: attrsFromMeta(meta),
  };
}

function orderedMetaEntries(meta: Meta | undefined): Array<[string, Meta]> {
  if (!meta) {
    return [];
  }
  return Object.entries(meta).map(([key, value]) => [
    key,
    value && typeof value === "object" && !Array.isArray(value) ? (value as Meta) : {},
  ]);
}

const BLOCK_FLAGS = ["kind", "runnable", "generator", "combiner", "description"] as const;

interface ExtractState {
  id: string;
  name: string;
  icon: string | null;
  attributes: Attribute[];
  namespaces: Map<string, Namespace>;
  types: TypeDef[];
  blocks: BlockDef[];
  functions: Map<string, { node: FunctionDeclaration; ns: string }>;
}

function ensureNamespace(state: ExtractState, id: string, name?: string): void {
  if (!id) {
    return;
  }
  const existing = state.namespaces.get(id);
  if (existing) {
    if (name && name.length > 0) {
      existing.name = name;
    }
    return;
  }
  const parts = id.split(".");
  let parent: string | null = null;
  if (parts.length > 1) {
    for (let i = parts.length - 1; i >= 1; i--) {
      const prefix = parts.slice(0, i).join(".");
      if (state.namespaces.has(prefix)) {
        parent = prefix;
        break;
      }
    }
  }
  state.namespaces.set(id, {
    id,
    name: name && name.length > 0 ? name : (parts.at(-1) ?? id),
    parent,
    icon: null,
    attributes: [],
  });
}

function typeFromNode(ctx: TscContext, node: Node | undefined): TypeExpr {
  if (!node) {
    return named("void");
  }
  const checker = ctx.checker;
  const type = checker.getTypeFromTypeNode?.(node as never) ?? checker.getTypeAtLocation(node);
  if (!type) {
    return named("void");
  }
  return registerCheckerType(checker, type, (text, ty) => ctx.registerType(text, ty));
}

function restElementType(ctx: TscContext, param: Node | undefined): TypeExpr {
  const ty = typeFromNode(ctx, param);
  if (ty.kind === "type" && ty.name === "Array" && ty.args[0]) {
    return ty.args[0];
  }
  return ty;
}

function addTypeDef(state: ExtractState, def: TypeDef): void {
  if (state.types.some((item) => item.name === def.name && item.ns === def.ns)) {
    return;
  }
  state.types.push(def);
}

function walk(ctx: TscContext, state: ExtractState, node: Node, ns: string): void {
  if (isModuleDeclaration(node)) {
    const name = moduleNameText(node);
    const next = ns ? `${ns}.${name}` : name;
    if (node.body) {
      walk(ctx, state, node.body, next);
    }
    return;
  }
  if (isModuleBlock(node)) {
    for (const stmt of node.statements) {
      walk(ctx, state, stmt, ns);
    }
    return;
  }
  if (isClassDeclaration(node)) {
    const decorators = classDecorators(node);
    const catalog = decorators.find((item) => item.name === "Catalog");
    if (catalog) {
      state.id = str(catalog.meta, "id", state.id) ?? state.id;
      state.name = str(catalog.meta, "name", state.name) ?? state.name;
      state.icon = str(catalog.meta, "icon") ?? state.icon;
      state.attributes = attrsFromMeta(catalog.meta);
    }
    const namespace = decorators.find((item) => item.name === "Namespace");
    if (namespace && ns) {
      ensureNamespace(state, ns, str(namespace.meta, "name"));
    }
    const typeDeco = decorators.find((item) => item.name === "Type");
    if (typeDeco) {
      const name = str(typeDeco.meta, "name", identText(node.name)) ?? identText(node.name);
      if (name) {
        const params = paramDefs(node);
        addTypeDef(state, {
          name,
          ns: ns || null,
          vars: params,
          params,
          ancestors: [],
          attributes: flagAttrs(typeDeco.meta, ["icon"]),
          source: state.id,
        });
        const type = ctx.checker.getTypeAtLocation(node);
        if (type) {
          registerCheckerType(ctx.checker, type, (text, ty) => ctx.registerType(text, ty));
        }
      }
    }
    return;
  }
  if (isTypeAliasDeclaration(node)) {
    const name = node.name.text;
    const params = paramDefs(node);
    addTypeDef(state, {
      name,
      ns: ns || null,
      vars: params,
      params,
      ancestors: [],
      attributes: [],
      source: state.id,
    });
    const type = ctx.checker.getTypeAtLocation(node);
    if (type) {
      registerCheckerType(ctx.checker, type, (text, ty) => ctx.registerType(text, ty));
    }
    return;
  }
  if (isFunctionDeclaration(node) && node.name) {
    state.functions.set(ns ? `${ns}.${node.name.text}` : node.name.text, { node, ns });
    if (!state.functions.has(node.name.text)) {
      state.functions.set(node.name.text, { node, ns });
    }
    return;
  }
  if (isExpressionStatement(node) && isCallExpression(node.expression)) {
    const wrapped = unwrapDecoratorCalls(node.expression);
    if (wrapped && wrapped.layers.some((layer) => layer.name === "Block")) {
      addBlock(ctx, state, wrapped.fnName, wrapped.layers, ns, node.expression);
    }
    return;
  }
  node.forEachChild((child) => {
    walk(ctx, state, child, ns);
  });
}

function lookupFunction(state: ExtractState, fnName: string, ns: string): { node: FunctionDeclaration; ns: string } | undefined {
  return state.functions.get(ns ? `${ns}.${fnName}` : fnName) ?? state.functions.get(fnName);
}

function addBlock(
  ctx: TscContext,
  state: ExtractState,
  fnName: string,
  layers: Array<{ name: string; meta: Meta }>,
  nsHint: string,
  call: CallExpression,
): void {
  const found = lookupFunction(state, fnName, nsHint);
  if (!found) {
    return;
  }
  const { node, ns } = found;
  const blockMeta = layers.find((layer) => layer.name === "Block")?.meta ?? {};
  const inputsMeta = layers.find((layer) => layer.name === "Inputs")?.meta;
  const outputsMeta = layers.find((layer) => layer.name === "Outputs")?.meta;
  const paramsMeta = layers.find((layer) => layer.name === "Params")?.meta;
  const paramEntries = orderedMetaEntries(paramsMeta);
  const inputEntries = orderedMetaEntries(inputsMeta);
  const outputEntries = orderedMetaEntries(outputsMeta);
  const parameters = paramEntries.map(([key, meta]) => parameterFromMeta(key, meta));
  const fnParams = [...node.parameters];
  const vars = paramDefs(node);
  const inputs: PortDef[] = [];
  const paramCount = parameters.length;
  const inputParams = fnParams.slice(paramCount);
  if (inputEntries.length > 0) {
    inputEntries.forEach(([key, meta], index) => {
      const param = inputParams[index];
      const rest = param?.dotDotDotToken !== undefined;
      const ty = rest
        ? restElementType(ctx, param)
        : typeFromNode(ctx, param?.type ?? param);
      inputs.push(portFromMeta(key, ty, "in", meta, rest || meta.vararg === true));
    });
  } else {
    for (const param of inputParams) {
      const name = identText(param.name) ?? "in";
      const ty = typeFromNode(ctx, param.type ?? param);
      inputs.push(portFromMeta(name, ty, "in", undefined, param.dotDotDotToken !== undefined));
    }
  }

  const outputs: PortDef[] = [];
  const returnTypeNode = node.type;
  if (returnTypeNode) {
    const text = returnTypeNode.getText();
    if (text !== "void") {
      const checkerType = ctx.checker.getTypeFromTypeNode?.(returnTypeNode as never) ?? ctx.checker.getTypeAtLocation(returnTypeNode);
      if (checkerType && (ctx.checker.isTupleType(checkerType) || checkerType.isTupleType?.())) {
        const args = checkerType.isTypeReference?.() ? ctx.checker.getTypeArguments(checkerType) : [];
        const elements = "elements" in returnTypeNode ? (returnTypeNode as { elements: readonly Node[] }).elements : [];
        if (elements.length > 0) {
          elements.forEach((element, index) => {
            const name = isNamedTupleMember(element) ? element.name.text : outputEntries[index]?.[0] ?? `out${index}`;
            const ty = args[index]
              ? registerCheckerType(ctx.checker, args[index]!, (t, ty) => ctx.registerType(t, ty))
              : typeFromNode(ctx, isNamedTupleMember(element) ? element.type : element);
            const meta = outputEntries.find((entry) => entry[0] === name)?.[1] ?? outputEntries[index]?.[1];
            outputs.push(portFromMeta(name, ty, "out", meta));
          });
        } else {
          args.forEach((arg, index) => {
            const name = outputEntries[index]?.[0] ?? (index === 0 ? "out" : `out${index}`);
            const ty = registerCheckerType(ctx.checker, arg, (t, ty) => ctx.registerType(t, ty));
            outputs.push(portFromMeta(name, ty, "out", outputEntries[index]?.[1]));
          });
        }
      } else {
        const ty = typeFromNode(ctx, returnTypeNode);
        const name = outputEntries[0]?.[0] ?? "out";
        outputs.push(portFromMeta(name, ty, "out", outputEntries[0]?.[1]));
      }
    }
  } else if (outputEntries.length > 0) {
    const signature = ctx.checker.getSignatureFromDeclaration(node);
    const ret = signature ? ctx.checker.getReturnTypeOfSignature(signature) : undefined;
    outputEntries.forEach(([key, meta], index) => {
      const ty = ret
        ? registerCheckerType(ctx.checker, ret, (t, ty) => ctx.registerType(t, ty))
        : named("void");
      void index;
      outputs.push(portFromMeta(key, ty, "out", meta));
    });
  }

  const factoryId = str(blockMeta, "factory", fnName) ?? fnName;
  const factory: Factory = { id: factoryId, args: [], attributes: [] };
  if (ns) {
    ensureNamespace(state, ns);
  }
  const block: BlockDef = {
    id: fnName,
    name: str(blockMeta, "name", fnName) ?? fnName,
    ns: ns || str(blockMeta, "ns", "") || "",
    icon: str(blockMeta, "icon") ?? null,
    vars,
    params: vars,
    parameters,
    settings: parameters,
    factory,
    inputs,
    outputs,
    attributes: flagAttrs(blockMeta, BLOCK_FLAGS),
    source: state.id,
  };
  if (!state.blocks.some((item) => item.id === block.id)) {
    state.blocks.push(block);
  }
  void call;
}

export function extractCatalog(ctx: TscContext, file: string): BlocksDoc {
  const sourceFile =
    ctx.sourceFile(file) ??
    ctx.program.getSourceFileNames().map((name) => ctx.program.getSourceFile(name)).find((sf) => sf && matchesFile(sf, file));
  if (!sourceFile) {
    throw new Error(`TypeScript catalog \`${file}\` is not in the TypeChecker program`);
  }
  const base = file.replace(/\.[^.]+$/, "");
  const state: ExtractState = {
    id: base,
    name: base,
    icon: null,
    attributes: [],
    namespaces: new Map(),
    types: [],
    blocks: [],
    functions: new Map(),
  };
  for (const stmt of sourceFile.statements) {
    walk(ctx, state, stmt, "");
  }
  // Second pass: decorator calls may appear before we recorded nested functions.
  state.functions.clear();
  const collect = (node: Node, ns: string): void => {
    if (isModuleDeclaration(node)) {
      const next = ns ? `${ns}.${moduleNameText(node)}` : moduleNameText(node);
      if (node.body) {
        collect(node.body, next);
      }
      return;
    }
    if (isModuleBlock(node)) {
      for (const stmt of node.statements) {
        collect(stmt, ns);
      }
      return;
    }
    if (isFunctionDeclaration(node) && node.name) {
      state.functions.set(ns ? `${ns}.${node.name.text}` : node.name.text, { node, ns });
      state.functions.set(node.name.text, { node, ns });
    }
    node.forEachChild((child) => collect(child, ns));
  };
  for (const stmt of sourceFile.statements) {
    collect(stmt, "");
  }
  state.blocks = [];
  const apply = (node: Node, ns: string): void => {
    if (isModuleDeclaration(node)) {
      const next = ns ? `${ns}.${moduleNameText(node)}` : moduleNameText(node);
      if (node.body) {
        apply(node.body, next);
      }
      return;
    }
    if (isModuleBlock(node)) {
      for (const stmt of node.statements) {
        apply(stmt, ns);
      }
      return;
    }
    if (isExpressionStatement(node) && isCallExpression(node.expression)) {
      const wrapped = unwrapDecoratorCalls(node.expression);
      if (wrapped && wrapped.layers.some((layer) => layer.name === "Block")) {
        addBlock(ctx, state, wrapped.fnName, wrapped.layers, ns, node.expression);
      }
      return;
    }
    if (isClassDeclaration(node) || isTypeAliasDeclaration(node)) {
      return;
    }
    node.forEachChild((child) => apply(child, ns));
  };
  // Types / namespaces already collected on first walk; collect functions then blocks.
  const types: TypeDef[] = [];
  const namespaces = new Map<string, Namespace>();
  const first = (node: Node, ns: string): void => {
    if (isModuleDeclaration(node)) {
      const next = ns ? `${ns}.${moduleNameText(node)}` : moduleNameText(node);
      if (node.body) {
        first(node.body, next);
      }
      return;
    }
    if (isModuleBlock(node)) {
      for (const stmt of node.statements) {
        first(stmt, ns);
      }
      return;
    }
    if (isClassDeclaration(node) || isTypeAliasDeclaration(node)) {
      walk(ctx, state, node, ns);
    }
    node.forEachChild((child) => first(child, ns));
  };
  state.types = [];
  state.namespaces.clear();
  for (const stmt of sourceFile.statements) {
    first(stmt, "");
  }
  types.push(...state.types);
  for (const [id, ns] of state.namespaces) {
    namespaces.set(id, ns);
  }
  for (const stmt of sourceFile.statements) {
    apply(stmt, "");
  }
  for (const type of types) {
    type.source = file;
  }
  for (const block of state.blocks) {
    block.source = file;
  }
  return {
    id: state.id,
    name: state.name,
    icon: state.icon,
    attributes: state.attributes,
    namespaces: [...namespaces.values()],
    types,
    blocks: state.blocks,
    source: file,
  };
}

export function extractAll(ctx: TscContext): BlocksDoc[] {
  const docs: BlocksDoc[] = [];
  for (const name of ctx.program.getSourceFileNames()) {
    const file = sourceName(name);
    if (!file || file === PRELUDE_FILE || file === "tsconfig.json") {
      continue;
    }
    docs.push(extractCatalog(ctx, file));
  }
  return docs;
}

export function decoratorCallNameOf(expr: Expression): string | undefined {
  return decoratorCallName(expr);
}
