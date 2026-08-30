import binaryen from "binaryen";
import { describe, expect, it } from "vitest";
import { BLOCK_SCRIPTS } from "../../resources/binaryen";
import { localNames as functionLocalNames } from "../../resources/binaryen/util";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { assembleModule, blockTypeWat, runtimeTypeWat } from "./assemble";
import { SAMPLE_CAP } from "./memory";
import { blockSignature, signatureWat } from "./signatures";

function functionText(id: string): string {
  const module = new binaryen.Module();
  try {
    BLOCK_SCRIPTS[id as keyof typeof BLOCK_SCRIPTS](module);
    return module.emitText();
  } finally {
    module.dispose();
  }
}

function localNames(id: string): string[] {
  const module = new binaryen.Module();
  try {
    return functionLocalNames(BLOCK_SCRIPTS[id as keyof typeof BLOCK_SCRIPTS](module));
  } finally {
    module.dispose();
  }
}

describe("block binaryen assembly", () => {
  it("keeps one binaryen.js script per runtime block", () => {
    expect(Object.keys(BLOCK_SCRIPTS).sort()).toEqual(["cos", "oscilloscope", "quantizer", "sin", "timer"]);
    expect(functionText("timer")).toContain("(param $ctx i32)");
    expect(functionText("timer")).toContain("(result f64)");
    expect(functionText("quantizer")).toContain("(param $in f64)");
    expect(functionText("quantizer")).toContain("(result f64)");
    expect(functionText("sin")).toContain("(param $in f64)");
    expect(functionText("cos")).toContain("(param $in f64)");
    expect(functionText("oscilloscope")).toContain("(param $in f64)");
    expect(functionText("oscilloscope")).not.toContain("(result");
  });

  it("matches XML port names in each block script", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();
    for (const id of Object.keys(BLOCK_SCRIPTS)) {
      const sig = blockSignature(cat.block(id)!);
      const names = localNames(id);
      expect(names[0], id).toBe("ctx");
      expect(names.slice(1), id).toEqual(sig.params.map((port) => port.name));
      const header = signatureWat(sig);
      expect(header, id).toContain(`(func $${id}`);
      for (const port of sig.params) {
        expect(header, id).toContain(`(param $${port.name} ${port.type})`);
      }
    }
  });

  it("assembles every block script into the final module", async () => {
    const { text, wasm } = await assembleModule({ stages: ["quantizer", "sin"], delayMs: 10 });
    expect(text).toContain("(module");
    expect(text).toContain("(func $timer");
    expect(text).toContain("(type $fn_timer");
    expect(text).toContain("(func $quantizer");
    expect(text).toContain("(func $sin");
    expect(text).toContain("(func $cos");
    expect(text).toContain("(func $oscilloscope");
    expect(text).toContain("(type $fn_oscilloscope");
    expect(text).toContain("ref.func $timer");
    expect(text).toContain("ref.func $quantizer");
    expect(text).toContain("ref.func $sin");
    expect(text).toContain("ref.func $oscilloscope");
    expect(text).toContain("call_ref $fn_timer");
    expect(text).toContain("call_ref $fn_oscilloscope");
    expect(text).toContain("(local $ctx i32)");
    expect(text).toContain("memory.atomic.wait32");
    expect(text).toContain(`i32.const ${SAMPLE_CAP}`);
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);

    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    expect(blockTypeWat(blockSignature(diagram.catalog().block("timer")!))).toContain(
      "(type $fn_timer (func (param $ctx i32) (param $in f64)))",
    );
    expect(runtimeTypeWat()).toContain("(type $fn_timer (func (param $ctx i32) (result $out f64)))");
  });
});
