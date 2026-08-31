/** @vitest-environment node */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("./index.ts", import.meta.url));

function resolveSpec(fromFile: string, spec: string): string | undefined {
  if (spec === "binaryen") {
    return spec;
  }
  if (!spec.startsWith(".")) {
    return undefined;
  }
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, resolve(base, "index.ts")]) {
    if (existsSync(candidate) && candidate.endsWith(".ts")) {
      return candidate;
    }
  }
  return undefined;
}

function valueSpecs(source: string): string[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const values = new Set<string>();
  for (const match of stripped.matchAll(/\b(?:import|export)\s+[\s\S]*?from\s+["']([^"']+)["']/g)) {
    if (/\b(?:import|export)\s+type\b/.test(match[0])) {
      continue;
    }
    values.add(match[1]!);
  }
  for (const match of stripped.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    values.add(match[1]!);
  }
  for (const match of stripped.matchAll(/\bexport\s+\*\s+from\s+["']([^"']+)["']/g)) {
    values.add(match[1]!);
  }
  return [...values];
}

describe("@bld/wasm public entry", () => {
  it("does not statically import binaryen.js", () => {
    const queue = [entry];
    const seen = new Set<string>();
    const hits: string[] = [];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      if (file === "binaryen") {
        hits.push(file);
        continue;
      }
      const source = readFileSync(file, "utf8");
      for (const spec of valueSpecs(source)) {
        const resolved = resolveSpec(file, spec);
        if (resolved === "binaryen") {
          hits.push(`${file} -> binaryen`);
        } else if (resolved) {
          queue.push(resolved);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
