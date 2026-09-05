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

  it("emits MCU env FFI and app_main for the linear wasm target", () => {
    const files = emitSolutionFiles(catalog(), sinView(), new Map(), "wasm");
    const sources = Object.fromEntries(files);
    expect(sources["runtime.mbt"]).toContain('extern "wasm" fn host_wait_event');
    expect(sources["runtime.mbt"]).toContain('= "env" "wait_event"');
    expect(sources["runtime.mbt"]).toContain("pub fn app_main() -> Unit");
    expect(sources["runtime.mbt"]).toContain("host_timer_start");
    expect(sources["runtime.mbt"]).toContain("if event_type == 1");
    expect(sources["runtime.mbt"]).toContain("fn math_sin(");
    expect(sources["runtime.mbt"]).not.toContain('= "Math" "sin"');
    expect(sources["runtime.mbt"]).not.toContain("js_set_interval");
    expect(sources["runtime.mbt"]).not.toContain("to_double");
    expect(sources["runtime.mbt"]).not.toContain(" % ");
    expect(sources["main.mbt"]).toContain("pub fn tick() -> Unit");
  });

  it("emits MCU app_main that ticks GPIO In on pin events, not a timer", () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "gpio_out", pin: 1 },
        { id: 2, defId: "gpio_in", pin: 0 },
      ],
      [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    );
    const files = emitSolutionFiles(catalog(), view, new Map(), "wasm");
    const sources = Object.fromEntries(files);
    expect(sources["runtime.mbt"]).toContain("host_attach_irq(0, 3)");
    expect(sources["runtime.mbt"]).toContain("if event_type == 2");
    expect(sources["runtime.mbt"]).not.toContain("host_timer_start(0,");
    expect(sources["runtime.mbt"]).not.toContain("if event_type == 1");
  });

  it("joins the package files for emitText", () => {
    const text = emitSolutionMoonbit(catalog(), sinView(), new Map());
    expect(text).toContain("type C1 = (Double) -> Unit");
    expect(text).toContain("pub fn tick() -> Unit");
    expect(text).toContain("timer(0,");
    expect(text).toContain("scope(0)");
  });
});
