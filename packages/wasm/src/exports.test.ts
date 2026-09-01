import { describe, expect, it } from "vitest";
import { canUseIsolatedWorker } from "./isolation";

describe("@bld/wasm module boundaries", () => {
  it("loads isolation without the assembler", async () => {
    expect(typeof canUseIsolatedWorker).toBe("function");
    const isolation = await import("./isolation");
    expect(Object.keys(isolation)).not.toContain("preloadAssembler");
    const wasm = await import("./solution/wasm");
    expect(typeof wasm.preloadAssembler).toBe("function");
  });
});
