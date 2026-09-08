import { describe, expect, it } from "vitest";
import { Catalog } from "./blocks/catalog";
import { flowPeriodMs } from "./flow";

describe("@bld/model module boundaries", () => {
  it("loads catalog without CS internals", async () => {
    expect(typeof Catalog).toBe("function");
    expect(typeof flowPeriodMs).toBe("function");
    expect(Object.keys(await import("./blocks/catalog"))).not.toContain("Generator");
  });
});
