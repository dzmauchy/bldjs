import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Diagram } from "@bld/xml/blocks/diagram";
import { solutionViewFrom } from "@bld/xml/solution/view";
import { emitSolutionFiles, emitSolutionMoonbit } from "./emit";
import { CTX_PARAM } from "./types";

function catalog() {
  const diagram = new Diagram("workspace", "Workspace");
  associateBuiltinModels(diagram);
  return diagram.catalog();
}

function sinView() {
  return solutionViewFrom(
    [
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "timer" },
    ],
    [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ],
  );
}

describe("emitSolutionFiles", () => {
  it("splits FFI, XML blocks, and tick into one MoonBit package", () => {
    const files = emitSolutionFiles(catalog(), sinView(), new Map());
    expect(files.map(([name]) => name)).toEqual(["runtime.mbt", "blocks.mbt", "main.mbt"]);
    const sources = Object.fromEntries(files);
    expect(sources["runtime.mbt"]).toContain("type C1 = (Double) -> Unit");
    expect(sources["runtime.mbt"]).toContain("fn stopped() -> Unit");
    expect(sources["runtime.mbt"]).toContain("pub fn start(delay_ms : Int) -> Unit");
    expect(sources["blocks.mbt"]).toContain(`fn sin(${CTX_PARAM}, input : C1) -> C1`);
    expect(sources["blocks.mbt"]).toContain(`fn timer(${CTX_PARAM}, input : C1) -> Unit`);
    expect(sources["blocks.mbt"]).toContain(`fn scope(${CTX_PARAM}) -> C1`);
    expect(sources["blocks.mbt"]).not.toContain("let _ = ctx");
    expect(sources["main.mbt"]).toContain("pub fn tick() -> Unit");
    expect(sources["main.mbt"]).toContain("  stopped()");
    expect(sources["main.mbt"]).not.toContain("let _ = stopped()");
  });

  it("joins the package files for emitText", () => {
    const text = emitSolutionMoonbit(catalog(), sinView(), new Map());
    expect(text).toContain("type C1 = (Double) -> Unit");
    expect(text).toContain("pub fn tick() -> Unit");
    expect(text).toContain("timer(0,");
    expect(text).toContain("scope(0)");
  });
});
