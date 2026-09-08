import { describe, expect, it } from "vitest";

const sources = import.meta.glob(["../state.ts", "../flow/avoid-router.ts"], {
  query: "?raw",
  eager: true,
  import: "default",
}) as Record<string, string>;

describe("UI package coupling", () => {
  it("keeps AppState off package-root barrels", () => {
    const state = sources["../state.ts"];
    expect(state).toBeDefined();
    expect(state).not.toMatch(/from ["']@bld\/wasm["']/);
    expect(state).not.toMatch(/from ["']@bld\/model["']/);
    expect(state).toContain('from "@bld/model/blocks/catalog"');
    expect(state).toContain('from "./state/run"');
    expect(state).toContain('from "./state/io"');
  });

  it("imports isolation from the model package", () => {
    const avoid = sources["../flow/avoid-router.ts"];
    expect(avoid).toBeDefined();
    expect(avoid).toContain('from "@bld/model/isolation"');
    expect(avoid).not.toMatch(/from ["']@bld\/model["']/);
  });
});
