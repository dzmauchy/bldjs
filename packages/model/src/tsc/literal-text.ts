import { skipTrivia } from "../tsc/desugar";

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

function parseString(source: string, i: number): { value: string; next: number } {
  const quote = source[i]!;
  i += 1;
  let value = "";
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      value += source[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { value, next: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return { value, next: i };
}

function parseNumber(source: string, i: number): { value: number; next: number } {
  let j = i;
  if (source[j] === "-") {
    j += 1;
  }
  while (j < source.length && /[0-9.eE+]/.test(source[j]!)) {
    j += 1;
  }
  return { value: Number(source.slice(i, j)), next: j };
}

function parseIdent(source: string, i: number): { value: string; next: number } {
  let j = i;
  while (j < source.length && /[A-Za-z0-9_$\u00A0-\uFFFF]/.test(source[j]!)) {
    j += 1;
  }
  return { value: source.slice(i, j), next: j };
}

export function parseJsonLike(source: string, start: number): { value: unknown; next: number } {
  let i = skipTrivia(source, start);
  const ch = source[i]!;
  if (ch === '"' || ch === "'") {
    return parseString(source, i);
  }
  if (ch === "-" || (ch >= "0" && ch <= "9")) {
    return parseNumber(source, i);
  }
  if (source.startsWith("true", i) && !/[A-Za-z0-9_$]/.test(source[i + 4] ?? "")) {
    return { value: true, next: i + 4 };
  }
  if (source.startsWith("false", i) && !/[A-Za-z0-9_$]/.test(source[i + 5] ?? "")) {
    return { value: false, next: i + 5 };
  }
  if (source.startsWith("null", i) && !/[A-Za-z0-9_$]/.test(source[i + 4] ?? "")) {
    return { value: null, next: i + 4 };
  }
  if (ch === "[") {
    const items: unknown[] = [];
    i += 1;
    i = skipTrivia(source, i);
    while (i < source.length && source[i] !== "]") {
      const parsed = parseJsonLike(source, i);
      items.push(parsed.value);
      i = skipTrivia(source, parsed.next);
      if (source[i] === ",") {
        i = skipTrivia(source, i + 1);
      }
    }
    return { value: items, next: source[i] === "]" ? i + 1 : i };
  }
  if (ch === "{") {
    const record: Record<string, unknown> = {};
    i += 1;
    i = skipTrivia(source, i);
    while (i < source.length && source[i] !== "}") {
      let key: string;
      if (source[i] === '"' || source[i] === "'") {
        const parsed = parseString(source, i);
        key = parsed.value;
        i = parsed.next;
      } else {
        const parsed = parseIdent(source, i);
        key = parsed.value;
        i = parsed.next;
      }
      i = skipTrivia(source, i);
      if (source[i] === ":") {
        i += 1;
      }
      const parsed = parseJsonLike(source, i);
      record[key] = parsed.value;
      i = skipTrivia(source, parsed.next);
      if (source[i] === ",") {
        i = skipTrivia(source, i + 1);
      }
    }
    return { value: record, next: source[i] === "}" ? i + 1 : i };
  }
  const ident = parseIdent(source, i);
  return { value: ident.value, next: ident.next };
}

export function findDecoratorCalls(source: string, name: string): Array<{ args: unknown[]; index: number }> {
  const found: Array<{ args: unknown[]; index: number }> = [];
  const needle = `@${name}(`;
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (source.startsWith(needle, i)) {
      const args: unknown[] = [];
      let j = skipTrivia(source, i + needle.length);
      while (j < source.length && source[j] !== ")") {
        const parsed = parseJsonLike(source, j);
        args.push(parsed.value);
        j = skipTrivia(source, parsed.next);
        if (source[j] === ",") {
          j = skipTrivia(source, j + 1);
        }
      }
      found.push({ args, index: i });
      i = source[j] === ")" ? j + 1 : j + 1;
      continue;
    }
    i += 1;
  }
  return found;
}
