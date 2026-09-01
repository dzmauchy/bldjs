import { describe, expect, it } from "vitest";
import { Catalog } from "./blocks/catalog";
import { flowPeriodMs } from "./flow";

describe("@bld/xml module boundaries", () => {
  it("loads catalog without CS generator classes", async () => {
    const cs = await import("./blocks/cs/generators");
    expect(typeof Catalog).toBe("function");
    expect(typeof flowPeriodMs).toBe("function");
    expect(Object.keys(await import("./blocks/catalog"))).not.toContain("Generator");
    expect(typeof cs.Generator).toBe("function");
  });
});
