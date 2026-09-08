/** Erase TypeScript types and emit namespace IIFEs so diagram workers can run the result. */

import { skipTrivia } from "./desugar";

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

function isKeywordAt(source: string, i: number, word: string): boolean {
  if (!source.startsWith(word, i)) {
    return false;
  }
  const before = source[i - 1] ?? "";
  const after = source[i + word.length] ?? "";
  if (before && isIdentPart(before)) {
    return false;
  }
  if (after && isIdentPart(after)) {
    return false;
  }
  return true;
}

function skipType(source: string, i: number): number {
  i = skipTrivia(source, i);
  i = skipTypePrimary(source, i);
  i = skipTrivia(source, i);
  while (source[i] === "|" || source[i] === "&") {
    i = skipTypePrimary(source, skipTrivia(source, i + 1));
    i = skipTrivia(source, i);
  }
  return i;
}

function skipTypePrimary(source: string, i: number): number {
  i = skipTrivia(source, i);
  if (isKeywordAt(source, i, "readonly") || isKeywordAt(source, i, "typeof") || isKeywordAt(source, i, "keyof") || isKeywordAt(source, i, "infer")) {
    const ident = readIdent(source, i);
    return skipTypePrimary(source, ident?.next ?? i);
  }
  if (source[i] === "<") {
    return skipTypePrimary(source, skipBalanced(source, i, "<", ">"));
  }
  if (source[i] === "(") {
    const close = skipBalanced(source, i, "(", ")");
    i = skipTrivia(source, close);
    if (source.startsWith("=>", i)) {
      return skipType(source, i + 2);
    }
    return close;
  }
  if (source[i] === "{") {
    return skipBalanced(source, i, "{", "}");
  }
  if (source[i] === "[") {
    return skipBalanced(source, i, "[", "]");
  }
  if (source[i] === '"' || source[i] === "'") {
    return skipString(source, i);
  }
  const ident = readIdent(source, i);
  if (!ident) {
    if (source[i] === "-" || (source[i] !== undefined && source[i]! >= "0" && source[i]! <= "9")) {
      let j = i + 1;
      while (j < source.length && /[0-9.eEn_]/.test(source[j]!)) {
        j += 1;
      }
      return j;
    }
    return i;
  }
  i = ident.next;
  i = skipTrivia(source, i);
  while (source[i] === ".") {
    i = skipTrivia(source, i + 1);
    const next = readIdent(source, i);
    if (!next) {
      break;
    }
    i = skipTrivia(source, next.next);
  }
  if (source[i] === "<") {
    i = skipTrivia(source, skipBalanced(source, i, "<", ">"));
  }
  while (source[i] === "[") {
    i = skipTrivia(source, skipBalanced(source, i, "[", "]"));
  }
  return i;
}

function skipDeclaration(source: string, i: number, end: number): number {
  let depthBrace = 0;
  let depthParen = 0;
  let depthBracket = 0;
  while (i < end) {
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
    if (ch === "{") {
      depthBrace += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depthBrace -= 1;
      i += 1;
      if (depthBrace < 0) {
        return i - 1;
      }
      if (depthBrace === 0 && depthParen === 0 && depthBracket === 0) {
        const next = skipTrivia(source, i);
        if (source[next] === ";") {
          return next + 1;
        }
        return i;
      }
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
    if (ch === ";" && depthBrace === 0 && depthParen === 0 && depthBracket === 0) {
      return i + 1;
    }
    i += 1;
  }
  return i;
}

function skipDecorator(source: string, i: number): number {
  if (source[i] !== "@") {
    return i;
  }
  i += 1;
  const ident = readIdent(source, i);
  if (!ident) {
    return i;
  }
  i = skipTrivia(source, ident.next);
  if (source[i] === "(") {
    i = skipBalanced(source, i, "(", ")");
  }
  return skipTrivia(source, i);
}

function parseDottedName(source: string, i: number): { names: string[]; next: number } | undefined {
  const names: string[] = [];
  while (true) {
    const ident = readIdent(source, skipTrivia(source, i));
    if (!ident) {
      return names.length > 0 ? { names, next: i } : undefined;
    }
    names.push(ident.ident);
    i = skipTrivia(source, ident.next);
    if (source[i] !== ".") {
      return { names, next: i };
    }
    i += 1;
  }
}

function topLevelFunctionNames(source: string, start: number, end: number): string[] {
  const names: string[] = [];
  let i = start;
  let depth = 0;
  while (i < end) {
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
    if (ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && isKeywordAt(source, i, "function")) {
      const after = skipTrivia(source, i + "function".length);
      const ident = readIdent(source, after);
      if (ident) {
        names.push(ident.ident);
        i = ident.next;
        continue;
      }
    }
    i += 1;
  }
  return names;
}

function wrapNamespace(parts: string[], inner: string, outerParts: string[]): string {
  const ns = parts[parts.length - 1];
  const names = topLevelFunctionNames(inner, 0, inner.length);
  let body = inner.trim();
  if (ns) {
    for (const name of names) {
      body += `\n${ns}.${name} = ${name};`;
    }
  }
  let code = body;
  for (let index = parts.length - 1; index >= 0; index--) {
    const name = parts[index]!;
    const parent = index > 0 ? parts[index - 1] : outerParts[outerParts.length - 1];
    if (parent) {
      code = `var ${name};\n(function (${name}) {\n${code}\n})(${name} = ${parent}.${name} || (${parent}.${name} = {}));`;
    } else {
      code = `var ${name};\n(function (${name}) {\n${code}\n})(${name} || (${name} = {}));`;
    }
  }
  return code;
}

function stripTypesInRange(source: string, start: number, end: number): string {
  let out = "";
  let i = start;
  let brace: Array<"block" | "object"> = [];
  let paren = 0;
  let ternary = 0;
  const pushBrace = (kind: "block" | "object") => {
    brace.push(kind);
  };
  const lastNonTrivia = (): string => {
    let j = out.length - 1;
    while (j >= 0 && /\s/.test(out[j]!)) {
      j -= 1;
    }
    return out[j] ?? "";
  };
  const lastTokenIs = (word: string): boolean => {
    const trimmed = out.trimEnd();
    if (!trimmed.endsWith(word)) {
      return false;
    }
    const before = trimmed[trimmed.length - word.length - 1] ?? "";
    return !isIdentPart(before);
  };

  while (i < end) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      const next = skipString(source, i);
      out += source.slice(i, next);
      i = next;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const next = skipLineComment(source, i);
      out += source.slice(i, next);
      i = next;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const next = skipBlockComment(source, i);
      out += source.slice(i, next);
      i = next;
      continue;
    }
    if (ch === "@") {
      i = skipDecorator(source, i);
      continue;
    }
    if (isKeywordAt(source, i, "interface") || isKeywordAt(source, i, "declare")) {
      i = skipDeclaration(source, i, end);
      continue;
    }
    if (isKeywordAt(source, i, "type")) {
      const after = skipTrivia(source, i + 4);
      if (readIdent(source, after)) {
        i = skipDeclaration(source, i, end);
        continue;
      }
    }
    if (isKeywordAt(source, i, "as") || isKeywordAt(source, i, "satisfies")) {
      i = skipType(source, readIdent(source, i)!.next);
      continue;
    }
    if (isKeywordAt(source, i, "function")) {
      out += "function";
      i += "function".length;
      i = skipTrivia(source, i);
      const ident = readIdent(source, i);
      if (ident) {
        out += ` ${ident.ident}`;
        i = ident.next;
      }
      i = skipTrivia(source, i);
      if (source[i] === "<") {
        i = skipBalanced(source, i, "<", ">");
        i = skipTrivia(source, i);
      }
      continue;
    }
    if (ch === "<" && lastTokenIs("function") === false) {
      const prev = lastNonTrivia();
      if (isIdentPart(prev) && source[i + 1] !== "=" && source[i + 1] !== " ") {
        const look = skipTrivia(source, i + 1);
        if (isIdentStart(source[look] ?? "") || source[look] === ">") {
          const close = skipBalanced(source, i, "<", ">");
          const after = skipTrivia(source, close);
          if (source[after] === "(") {
            i = close;
            continue;
          }
        }
      }
    }
    if (ch === "!" && source[i + 1] !== "=") {
      const prev = lastNonTrivia();
      if (isIdentPart(prev) || prev === ")" || prev === "]") {
        i += 1;
        continue;
      }
    }
    if (ch === "?") {
      const after = skipTrivia(source, i + 1);
      if (source[i + 1] !== "?" && source[i + 1] !== "." && source[after] === ":") {
        i += 1;
        continue;
      }
      if (source[i + 1] !== "?" && source[i + 1] !== "." && source[i + 1] !== ":") {
        ternary += 1;
        out += ch;
        i += 1;
        continue;
      }
    }
    if (ch === ":" && ternary > 0) {
      ternary -= 1;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === ":" && brace[brace.length - 1] !== "object") {
      i = skipType(source, i + 1);
      continue;
    }
    if (ch === "{") {
      const prev = lastNonTrivia();
      const objectish = prev === "=" || prev === "(" || prev === "," || prev === "[" || prev === ":" || lastTokenIs("return");
      pushBrace(objectish ? "object" : "block");
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "}") {
      brace.pop();
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "(") {
      paren += 1;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === ")") {
      paren -= 1;
      out += ch;
      i += 1;
      const after = skipTrivia(source, i);
      if (source[after] === ":") {
        i = skipType(source, after + 1);
      }
      continue;
    }
    out += ch;
    i += 1;
    void paren;
  }
  return out;
}

function emitRange(source: string, start: number, end: number, nsParts: string[]): string {
  let i = start;
  let out = "";
  while (i < end) {
    const next = skipTrivia(source, i);
    out += source.slice(i, next);
    i = next;
    if (i >= end) {
      break;
    }
    while (source[i] === "@") {
      i = skipDecorator(source, i);
      i = skipTrivia(source, i);
    }
    if (isKeywordAt(source, i, "namespace")) {
      i = skipTrivia(source, i + "namespace".length);
      const parsed = parseDottedName(source, i);
      if (!parsed) {
        break;
      }
      i = skipTrivia(source, parsed.next);
      if (source[i] !== "{") {
        break;
      }
      const bodyEnd = skipBalanced(source, i, "{", "}");
      const inner = emitRange(source, i + 1, bodyEnd - 1, [...nsParts, ...parsed.names]);
      out += wrapNamespace(parsed.names, inner, nsParts);
      i = bodyEnd;
      continue;
    }
    if (isKeywordAt(source, i, "interface") || isKeywordAt(source, i, "declare")) {
      i = skipDeclaration(source, i, end);
      continue;
    }
    if (isKeywordAt(source, i, "type")) {
      const after = skipTrivia(source, i + 4);
      if (readIdent(source, after)) {
        i = skipDeclaration(source, i, end);
        continue;
      }
    }
    const stmtEnd = skipStatement(source, i, end);
    out += stripTypesInRange(source, i, stmtEnd);
    i = stmtEnd;
  }
  return out;
}

function skipStatement(source: string, i: number, end: number): number {
  let depthBrace = 0;
  let depthParen = 0;
  let started = false;
  while (i < end) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      started = true;
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
    if (ch === "{") {
      depthBrace += 1;
      started = true;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depthBrace -= 1;
      i += 1;
      if (depthBrace <= 0 && depthParen <= 0) {
        return i;
      }
      continue;
    }
    if (ch === "(") {
      depthParen += 1;
      started = true;
      i += 1;
      continue;
    }
    if (ch === ")") {
      depthParen -= 1;
      i += 1;
      continue;
    }
    if (ch === ";" && depthBrace === 0 && depthParen === 0) {
      return i + 1;
    }
    if (!started && (ch === "\n" || ch === "\r")) {
      i += 1;
      continue;
    }
    started = true;
    i += 1;
  }
  return i;
}

export function eraseToJavaScript(source: string): string {
  return emitRange(source, 0, source.length, []).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
