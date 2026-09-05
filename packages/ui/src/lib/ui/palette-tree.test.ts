import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Diagram } from "@bld/xml/blocks/diagram";
import { buildPaletteTree, paletteGroupIds } from "./palette-tree";

describe("palette tree", () => {
  it("nests com.dauch.cs.* under com.dauch.cs", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const tree = buildPaletteTree(diagram.catalog());
    expect(tree.map((group) => group.id)).toEqual(["com.dauch.cs"]);
    const cs = tree[0];
    expect(cs.blocks.map((block) => block.id)).toEqual([]);
    expect(cs.children.map((group) => group.id)).toEqual([
      "com.dauch.cs.gen",
      "com.dauch.cs.gpio",
      "com.dauch.cs.sink",
      "com.dauch.cs.tf",
    ]);
    expect(cs.children.find((group) => group.id === "com.dauch.cs.gen")?.blocks.map((block) => block.id)).toEqual([
      "random",
      "timer",
    ]);
    expect(cs.children.find((group) => group.id === "com.dauch.cs.gpio")?.blocks.map((block) => block.id)).toEqual([
      "gpio_in",
      "gpio_out",
    ]);
    expect(cs.children.find((group) => group.id === "com.dauch.cs.tf")?.blocks.map((block) => block.id)).toEqual([
      "cos",
      "overshoot",
      "sin",
    ]);
    expect(cs.children.find((group) => group.id === "com.dauch.cs.sink")?.blocks.map((block) => block.id)).toEqual([
      "scope",
    ]);
    expect(paletteGroupIds(tree)).toEqual([
      "com.dauch.cs",
      "com.dauch.cs.gen",
      "com.dauch.cs.gpio",
      "com.dauch.cs.sink",
      "com.dauch.cs.tf",
    ]);
  });
});
