import { describe, expect, it } from "vitest";
import { canShareMemory, canUseDiagramWorker, canUseIsolatedWorker } from "./isolation";

describe("isolation", () => {
  it("reports worker and shared-memory support without throwing", () => {
    expect(typeof canShareMemory()).toBe("boolean");
    expect(typeof canUseIsolatedWorker()).toBe("boolean");
    expect(typeof canUseDiagramWorker()).toBe("boolean");
  });
});
