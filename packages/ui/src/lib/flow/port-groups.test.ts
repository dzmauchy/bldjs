import { describe, expect, it } from "vitest";
import { groupPortViews } from "./port-groups";
import type { PortView } from "./types";

function port(name: string, overrides: Partial<PortView> = {}): PortView {
  return { name, typeLabel: "c<f64>", vararg: false, ...overrides };
}

describe("groupPortViews", () => {
  it("keeps a scalar port as a single unlabeled-rail group", () => {
    expect(groupPortViews([port("in")])).toEqual([
      { catalogName: "in", label: "in", vectorized: false, ports: [port("in")] },
    ]);
  });

  it("marks vararg and catalog-vector ports as rails", () => {
    const elems = groupPortViews([port("elems", { vararg: true, typeLabel: "f64" })]);
    expect(elems[0]).toMatchObject({
      catalogName: "elems",
      label: "elems…",
      vectorized: true,
    });
    const vector = groupPortViews([port("out", { vectorized: true, typeLabel: "c<f64>" })]);
    expect(vector[0]?.vectorized).toBe(true);
  });

  it("merges extra slots onto one named rail", () => {
    const groups = groupPortViews([
      port("out", { vectorized: true, typeLabel: "c<f64>" }),
      port("out[1]", { typeLabel: "c<f64>" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      catalogName: "out",
      label: "out",
      vectorized: true,
    });
    expect(groups[0]?.ports.map((item) => item.name)).toEqual(["out", "out[1]"]);
  });

  it("turns extra consumer slots into a rail even without a catalog flag", () => {
    const groups = groupPortViews([port("in"), port("in[1]")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.vectorized).toBe(true);
    expect(groups[0]?.label).toBe("in");
  });
});
