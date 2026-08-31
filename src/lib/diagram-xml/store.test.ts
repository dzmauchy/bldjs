import { describe, expect, it } from "vitest";
import { MemoryDiagramRepository } from "./store";

describe("diagram library", () => {
  it("saves, lists, loads, and deletes diagrams", async () => {
    const repo = new MemoryDiagramRepository();
    await repo.save({
      id: "diag_a",
      name: "Alpha",
      xml: "<diagram/>",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:10:00Z",
    });
    await repo.save({
      id: "diag_b",
      name: "Beta",
      xml: "<diagram id='b'/>",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:20:00Z",
    });
    expect((await repo.list()).map((item) => item.id)).toEqual(["diag_b", "diag_a"]);
    expect((await repo.get("diag_a"))?.name).toBe("Alpha");
    await repo.remove("diag_a");
    expect(await repo.get("diag_a")).toBeUndefined();
    expect((await repo.list()).map((item) => item.id)).toEqual(["diag_b"]);
  });
});
