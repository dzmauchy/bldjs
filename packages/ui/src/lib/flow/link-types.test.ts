import { describe, expect, it } from "vitest";
import { arrayOf, consumerType, named } from "@bld/xml/blocks/ast";
import { associateBuiltinModels, associateFixtureModels } from "@bld/xml/blocks/builtin";
import { Diagram } from "@bld/xml/blocks/diagram";
import { AppState } from "$lib/state";
import { shouldShowPortType, uniqueCompatibleDropPort, uniqueCompatibleInput } from "./link-types";

describe("shouldShowPortType", () => {
  const catalog = (() => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    return diagram.catalog();
  })();
  const consumer = consumerType(named("Double"));
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
    expect(shouldShowPortType(linking, 2, "in", "in", consumer, named("Double"), catalog, [])).toBe(false);
  });

  it("shows (Double) -> Unit inputs when the source is a consumer vector", () => {
    const vector = arrayOf(consumer);
    expect(shouldShowPortType({ blockId: 1, port: "out" }, 2, "in", "in", vector, consumer, catalog, [])).toBe(true);
  });

  it("shows extra slotted ports while linking", () => {
    expect(shouldShowPortType({ blockId: 1, port: "out[1]" }, 1, "out", "out[1]", consumer, consumer, catalog, [])).toBe(
      true,
    );
    expect(shouldShowPortType({ blockId: 1, port: "out[1]" }, 1, "out", "out", consumer, consumer, catalog, [])).toBe(
      false,
    );
    expect(shouldShowPortType({ blockId: 1, port: "out[1]" }, 2, "in", "in[1]", consumer, consumer, catalog, [])).toBe(
      true,
    );
  });
});

describe("uniqueCompatibleInput", () => {
  const catalog = (() => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    return diagram.catalog();
  })();
  const consumer = consumerType(named("Double"));
  const linking = { blockId: 1, port: "out" };

  it("returns the only compatible input", () => {
    expect(
      uniqueCompatibleInput(
        linking,
        consumer,
        { blockId: 2, params: [], inputs: [{ name: "in", ty: consumer }] },
        catalog,
      ),
    ).toBe("in");
  });

  it("ignores the source block and incompatible ports", () => {
    expect(
      uniqueCompatibleInput(
        linking,
        consumer,
        { blockId: 1, params: [], inputs: [{ name: "in", ty: consumer }] },
        catalog,
      ),
    ).toBeUndefined();
    expect(
      uniqueCompatibleInput(
        linking,
        consumer,
        { blockId: 2, params: [], inputs: [{ name: "in", ty: named("Double") }] },
        catalog,
      ),
    ).toBeUndefined();
  });

  it("stays quiet when two inputs both accept the source", () => {
    expect(
      uniqueCompatibleInput(
        linking,
        named("Double"),
        {
          blockId: 2,
          params: [],
          inputs: [
            { name: "left", ty: named("Double") },
            { name: "right", ty: named("Double") },
          ],
        },
        catalog,
      ),
    ).toBeUndefined();
  });

  it("picks the one compatible input on a two-port block", () => {
    const fixtures = (() => {
      const diagram = new Diagram("ws", "Workspace");
      associateFixtureModels(diagram);
      return diagram.catalog();
    })();
    const get = fixtures.block("b_array_get")!;
    expect(
      uniqueCompatibleInput(
        linking,
        named("Int"),
        {
          blockId: 2,
          params: get.params,
          inputs: get.inputs.map((port) => ({ name: port.name, ty: port.ty })),
        },
        fixtures,
      ),
    ).toBe("index");
  });
});

describe("uniqueCompatibleDropPort", () => {
  it("wires a drop onto a block that has one compatible input", () => {
    const app = new AppState();
    app.addBlock("scope", 0, 0);
    app.addBlock("timer", 200, 0);
    const scopeId = app.blocks.find((block) => block.defId === "scope")!.id;
    const timerId = app.blocks.find((block) => block.defId === "timer")!.id;
    app.linkingFrom = { blockId: scopeId, port: "out" };
    expect(uniqueCompatibleDropPort(app, timerId)).toBe("in");
    expect(uniqueCompatibleDropPort(app, scopeId)).toBeUndefined();
  });
});
