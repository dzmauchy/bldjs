import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "$lib/blocks";
import { generic, named } from "$lib/blocks/ast";
import { Diagram } from "$lib/blocks/diagram";
import { shouldShowPortType } from "./link-types";

describe("shouldShowPortType", () => {
  const catalog = (() => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    return diagram.catalog();
  })();
  const consumer = generic("c1", [named("f64")]);
  const linking = { blockId: 1, port: "out" };

  it("hides every port when not linking", () => {
    expect(shouldShowPortType(null, 1, "out", "out", consumer, consumer, catalog, [])).toBe(false);
    expect(shouldShowPortType(null, 2, "in", "in", consumer, consumer, catalog, [])).toBe(false);
  });

  it("shows the source output and compatible inputs on other blocks", () => {
    expect(shouldShowPortType(linking, 1, "out", "out", consumer, consumer, catalog, [])).toBe(true);
    expect(shouldShowPortType(linking, 1, "out", "other", consumer, consumer, catalog, [])).toBe(false);
    expect(shouldShowPortType(linking, 2, "in", "in", consumer, consumer, catalog, [])).toBe(true);
    expect(shouldShowPortType(linking, 1, "in", "in", consumer, consumer, catalog, [])).toBe(false);
  });

  it("hides incompatible inputs", () => {
    expect(shouldShowPortType(linking, 2, "in", "in", consumer, named("f64"), catalog, [])).toBe(false);
  });

  it("shows c<f64> inputs when the source is a consumer vector", () => {
    const vector = generic("[]", [consumer]);
    expect(shouldShowPortType({ blockId: 1, port: "out" }, 2, "in", "in", vector, consumer, catalog, [])).toBe(true);
  });
});
