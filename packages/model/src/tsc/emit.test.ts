import { describe, expect, it } from "vitest";
import { serializeCanvas } from "../diagram/json";
import { compileTypeScript, compileTypeScriptAsync, preloadTsc } from "./emit";

const timerScope = {
  id: "diag",
  name: "Pipe",
  createdAt: "2026-08-31T05:00:00Z",
  updatedAt: "2026-08-31T05:00:00Z",
  blocks: [
    { id: 1, defId: "scope", x: 0, y: 0 },
    { id: 2, defId: "timer", x: 180, y: 0 },
  ],
  links: [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
};

describe("esbuild-wasm emit", () => {
  it("skips browser wasmURL init on Node", async () => {
    await expect(preloadTsc()).resolves.toBeUndefined();
  });

  it("transpiles catalog TypeScript to CommonJS without type aliases", () => {
    const js = compileTypeScript(serializeCanvas(timerScope));
    expect(js).toContain("com.dauch.cs");
    expect(js).toContain("diagram");
    expect(js).not.toContain("type f32");
    expect(js).toMatch(/exports\.default|module\.exports/);
  });

  it("async compile matches sync output on Node", async () => {
    const source = serializeCanvas(timerScope);
    const syncJs = compileTypeScript(source);
    const asyncJs = await compileTypeScriptAsync(source);
    expect(asyncJs).toBe(syncJs);
  });
});
