import { describe, expect, it } from "vitest";
import { canShareMemory, canUseIsolatedWorker } from "./isolation";

describe("isolation", () => {
  it("can construct shared memory in Node", () => {
    expect(canShareMemory()).toBe(true);
  });

  it("does not start isolated workers without crossOriginIsolated", () => {
    expect(globalThis.crossOriginIsolated).not.toBe(true);
    expect(canUseIsolatedWorker()).toBe(false);
  });
});
