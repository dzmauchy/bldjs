import { describe, expect, it } from "vitest";
import { arrayOf, generic, named, type PortDef } from "./ast";
import type { Link } from "./diagram";
import {
  acceptsManyInputs,
  allocateIncomingSlot,
  allocateOutgoingSlot,
  catalogPortName,
  compactLinkSlots,
  findCatalogLink,
  incomingTo,
  inputSlotsFor,
  outputSlotsFor,
  PortLinks,
  portSlotIndex,
  slottedOutputType,
  slottedPortName,
} from "./ports";

const consumer = generic("c1", [named("f64")]);
const vector = arrayOf(consumer);

function port(name: string, ty = consumer, vararg = false): PortDef {
  return { name, ty, vararg, icon: null, attributes: [] };
}

describe("port slot names", () => {
  it("parses catalog names and extra indices", () => {
    expect(catalogPortName("out")).toBe("out");
    expect(catalogPortName("out[1]")).toBe("out");
    expect(catalogPortName("in[12]")).toBe("in");
    expect(portSlotIndex("out")).toBe(0);
    expect(portSlotIndex("out[1]")).toBe(1);
    expect(portSlotIndex("in[12]")).toBe(12);
    expect(slottedPortName("out", 0)).toBe("out");
    expect(slottedPortName("out", 1)).toBe("out[1]");
  });

  it("treats consumer and vararg inputs as many-accepting", () => {
    expect(acceptsManyInputs(port("in"))).toBe(true);
    expect(acceptsManyInputs(port("elems", named("f64"), true))).toBe(true);
    expect(acceptsManyInputs(port("x", named("f64")))).toBe(false);
  });

  it("unwraps every consumer-vector output pin to the channel type", () => {
    expect(slottedOutputType(vector, "out")).toEqual(consumer);
    expect(slottedOutputType(vector, "out[1]")).toEqual(consumer);
    expect(slottedOutputType(arrayOf(named("f64")), "result[1]")).toEqual(arrayOf(named("f64")));
  });
});

describe("allocate and compact extra slots", () => {
  it("assigns the next extra output and input for a second wire", () => {
    const first: Link = { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" };
    expect(allocateOutgoingSlot([first], 1, "out")).toBe("out[1]");
    expect(allocateIncomingSlot([first], 3, "in")).toBe("in");
    expect(allocateIncomingSlot([first], 2, "in")).toBe("in[1]");
  });

  it("finds a wire by catalog port even when slots differ", () => {
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
    ];
    expect(findCatalogLink(links, 1, "out", 3, "in")).toEqual(links[1]);
    expect(findCatalogLink(links, 1, "out[1]", 2, "in[1]")).toEqual(links[0]);
  });

  it("compacts remaining extra slots after a wire is removed", () => {
    const remaining: Link[] = [
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in[1]" },
      { fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in[2]" },
    ];
    expect(compactLinkSlots(remaining)).toEqual([
      { fromBlock: 1, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in[1]" },
    ]);
  });

  it("orders extra incoming slots by source Y so a higher block inserts above", () => {
    const remaining: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in[1]" },
    ];
    const y = (id: number) => ({ 1: { x: 0, y: 120 }, 2: { x: 0, y: 0 }, 3: { x: 200, y: 40 } })[id];
    expect(compactLinkSlots(remaining, y)).toEqual([
      { fromBlock: 1, fromOut: "out", toBlock: 3, toIn: "in[1]" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ]);
  });

  it("orders extra outgoing slots by target Y so a higher sink takes the upper pin", () => {
    const remaining: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 1, fromOut: "out[1]", toBlock: 2, toIn: "in" },
    ];
    const y = (id: number) => ({ 1: { x: 0, y: 40 }, 2: { x: 180, y: 0 }, 3: { x: 180, y: 120 } })[id];
    expect(compactLinkSlots(remaining, y)).toEqual([
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
    ]);
  });

  it("lists extra visual slots only for extra wires", () => {
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in[1]" },
    ];
    expect(outputSlotsFor([port("out", vector)], 1, links).map((slot) => slot.name)).toEqual(["out", "out[1]"]);
    expect(outputSlotsFor([port("out", vector)], 2, links).map((slot) => slot.name)).toEqual(["out"]);
    expect(inputSlotsFor([port("in")], 4, links).map((slot) => slot.name)).toEqual(["in", "in[1]"]);
    expect(inputSlotsFor([port("in")], 2, links).map((slot) => slot.name)).toEqual(["in"]);
  });

  it("orders incoming wires the same way as SolutionView", () => {
    const links: Link[] = [
      { fromBlock: 2, fromOut: "out[1]", toBlock: 4, toIn: "in[1]" },
      { fromBlock: 1, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    expect(incomingTo(links, 4, "in").map((link) => link.fromBlock)).toEqual([1, 2]);
    expect(new PortLinks(links).incoming(4, "in")).toEqual(incomingTo(links, 4, "in"));
  });
});
