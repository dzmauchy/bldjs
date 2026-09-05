import { describe, expect, it } from "vitest";

const sources = import.meta.glob("./**/*.ts", {
  query: "?raw",
  eager: true,
  import: "default",
}) as Record<string, string>;

const HUGE_PACKAGES = new Set(["binaryen", "@moonbit/moonc-worker"]);

function resolveRelative(fromFile: string, spec: string): string {
  const parts = fromFile.split("/");
  parts.pop();
  for (const segment of spec.split("/")) {
    if (segment === "." || segment === "") {
      continue;
    }
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

function resolveSpec(fromFile: string, spec: string): string | undefined {
  if (HUGE_PACKAGES.has(spec)) {
    return spec;
  }
  if (!spec.startsWith(".")) {
    return undefined;
  }
  const base = resolveRelative(fromFile, spec);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (candidate in sources) {
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

describe("@bld/wasm public entries", () => {
  it("does not statically import moonc-worker", () => {
    const queue = [
      "./isolation.ts",
      "./runtime/diagram-runner.ts",
      "./solution/wasm.ts",
    ];
    const seen = new Set<string>();
    const hits: string[] = [];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      if (HUGE_PACKAGES.has(file)) {
        hits.push(file);
        continue;
      }
      const source = sources[file];
      if (source === undefined) {
        continue;
      }
      for (const spec of valueSpecs(source)) {
        const resolved = resolveSpec(file, spec);
        if (resolved && HUGE_PACKAGES.has(resolved)) {
          hits.push(`${file} -> ${resolved}`);
        } else if (resolved) {
          queue.push(resolved);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
