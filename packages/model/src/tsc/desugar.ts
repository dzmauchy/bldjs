/** Rewrite `@Dec(...) function name` into a function plus `Dec(...)(name)` so tsc can typecheck. */

function isIdentStart(ch: string): boolean {
  return ch === "$" || ch === "_" || /[\p{ID_Start}]/u.test(ch);
}

function isIdentPart(ch: string): boolean {
  return ch === "$" || /[\p{ID_Continue}]/u.test(ch);
}

function skipLineComment(source: string, i: number): number {
  const end = source.indexOf("\n", i);
  return end < 0 ? source.length : end + 1;
}

function skipBlockComment(source: string, i: number): number {
  const end = source.indexOf("*/", i + 2);
  return end < 0 ? source.length : end + 2;
}

export function skipTrivia(source: string, i: number): number {
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    break;
  }
  return i;
}

function skipString(source: string, i: number): number {
  const quote = source[i]!;
  i += 1;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    i += 1;
  }
  return i;
}

function skipBalanced(source: string, i: number, open: string, close: string): number {
  let depth = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    if (ch === open) {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === close) {
      depth -= 1;
      i += 1;
      if (depth === 0) {
        return i;
      }
      continue;
    }
    i += 1;
  }
  return i;
}

function readIdent(source: string, i: number): { ident: string; next: number } | undefined {
  if (!isIdentStart(source[i] ?? "")) {
    return undefined;
  }
  let j = i + 1;
  while (j < source.length && isIdentPart(source[j]!)) {
    j += 1;
  }
  return { ident: source.slice(i, j), next: j };
}

interface DecoratorSpan {
  start: number;
  end: number;
  text: string;
}

function parseDecorator(source: string, i: number): { decorator: DecoratorSpan; next: number } | undefined {
  if (source[i] !== "@") {
    return undefined;
  }
  const start = i;
  i += 1;
  const ident = readIdent(source, i);
  if (!ident) {
    return undefined;
  }
  i = skipTrivia(source, ident.next);
  if (source[i] !== "(") {
    return undefined;
  }
  i = skipBalanced(source, i, "(", ")");
  return { decorator: { start, end: i, text: source.slice(start + 1, i) }, next: i };
}

function parseDecoratorChain(source: string, i: number): { decorators: DecoratorSpan[]; next: number } {
  const decorators: DecoratorSpan[] = [];
  while (true) {
    i = skipTrivia(source, i);
    const parsed = parseDecorator(source, i);
    if (!parsed) {
      break;
    }
    decorators.push(parsed.decorator);
    i = parsed.next;
  }
  return { decorators, next: i };
}

function parseFunctionAfterKeyword(
  source: string,
  fnKw: number,
): { name: string; nameStart: number; end: number } | undefined {
  let i = skipTrivia(source, fnKw + "function".length);
  if (source.startsWith("async", i) && /\s/.test(source[i + 5] ?? "")) {
    return undefined;
  }
  const ident = readIdent(source, i);
  if (!ident) {
    return undefined;
  }
  const name = ident.ident;
  const nameStart = i;
  i = ident.next;
  i = skipTrivia(source, i);
  if (source[i] === "<") {
    i = skipBalanced(source, i, "<", ">");
    i = skipTrivia(source, i);
  }
  if (source[i] !== "(") {
    return undefined;
  }
  i = skipBalanced(source, i, "(", ")");
  i = skipTrivia(source, i);
  if (source[i] === ":") {
    i += 1;
    let depthParen = 0;
    let depthBracket = 0;
    let depthAngle = 0;
    while (i < source.length) {
      const ch = source[i]!;
      if (ch === '"' || ch === "'" || ch === "`") {
        i = skipString(source, i);
        continue;
      }
      if (ch === "(") {
        depthParen += 1;
        i += 1;
        continue;
      }
      if (ch === ")") {
        depthParen -= 1;
        i += 1;
        continue;
      }
      if (ch === "[") {
        depthBracket += 1;
        i += 1;
        continue;
      }
      if (ch === "]") {
        depthBracket -= 1;
        i += 1;
        continue;
      }
      if (ch === "<") {
        depthAngle += 1;
        i += 1;
        continue;
      }
      if (ch === ">") {
        depthAngle -= 1;
        i += 1;
        continue;
      }
      if (ch === "{" && depthParen === 0 && depthBracket === 0 && depthAngle === 0) {
        break;
      }
      i += 1;
    }
  }
  i = skipTrivia(source, i);
  if (source[i] !== "{") {
    return undefined;
  }
  const end = skipBalanced(source, i, "{", "}");
  return { name, nameStart, end };
}

interface DecoratedFunction {
  decoStart: number;
  fnKw: number;
  end: number;
  name: string;
  decorators: DecoratorSpan[];
}

function findDecoratedFunctions(source: string): DecoratedFunction[] {
  const found: DecoratedFunction[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    if (ch === "@") {
      const chain = parseDecoratorChain(source, i);
      if (chain.decorators.length > 0) {
        let j = skipTrivia(source, chain.next);
        if (source.startsWith("export", j) && /\s/.test(source[j + 6] ?? "")) {
          j = skipTrivia(source, j + 6);
        }
        if (source.startsWith("function", j) && !isIdentPart(source[j + 8] ?? " ")) {
          const fn = parseFunctionAfterKeyword(source, j);
          if (fn) {
            found.push({
              decoStart: i,
              fnKw: j,
              end: fn.end,
              name: fn.name,
              decorators: chain.decorators,
            });
            i = fn.end;
            continue;
          }
        }
      }
    }
    i += 1;
  }
  return found;
}

function rewriteOne(source: string, item: DecoratedFunction): string {
  const fnText = source.slice(item.fnKw, item.end);
  let wrapped = item.name;
  for (let d = item.decorators.length - 1; d >= 0; d -= 1) {
    wrapped = `${item.decorators[d]!.text}(${wrapped})`;
  }
  const replacement = `${fnText}\n${wrapped};`;
  return source.slice(0, item.decoStart) + replacement + source.slice(item.end);
}

/**
 * Convert `@Block(...) function foo() {}` into `function foo() {}\nBlock(...)(foo);`
 * so the TypeScript checker sees a normal function (decorators on functions are not valid TS).
 */
export function desugarFunctionDecorators(source: string): string {
  let current = source;
  for (let guard = 0; guard < 2000; guard++) {
    const items = findDecoratedFunctions(current);
    if (items.length === 0) {
      return current;
    }
    const innermost = items.reduce((best, item) => (item.decoStart >= best.decoStart ? item : best));
    current = rewriteOne(current, innermost);
  }
  return current;
}
