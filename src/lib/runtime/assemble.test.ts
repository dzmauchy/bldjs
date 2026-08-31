import binaryen from "binaryen";
import { describe, expect, it } from "vitest";
import { BLOCK_SCRIPTS, addCatalogTypes, wasmFeatures } from "../resources/binaryen";
import { localNames as functionLocalNames } from "../resources/binaryen/util";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { assembleModule, blockTypeWat, runtimeTypeWat } from "./assemble";
import { SAMPLE_CAP, createMemory, readSamples } from "./memory";
import { instantiateGenerator } from "./generator";
import { blockSignature, signatureWat } from "./signatures";

function withBlockScript(id: string, use: (module: binaryen.Module) => void, sharedMemory = false): void {
  const module = new binaryen.Module();
  try {
    module.setFeatures(wasmFeatures(binaryen));
    const types = addCatalogTypes(binaryen, module);
    BLOCK_SCRIPTS[id](module, types, { sharedMemory });
    use(module);
  } finally {
    module.dispose();
  }
}

function functionText(id: string, sharedMemory = false): string {
  let text = "";
  withBlockScript(
    id,
    (module) => {
      text = module.emitText();
    },
    sharedMemory,
  );
  return text;
}

function localNames(id: string): string[] {
  let names: string[] = [];
  withBlockScript(id, (module) => {
    names = functionLocalNames(module.getFunction(id));
  });
  return names;
}

describe("block binaryen assembly", () => {
  it("keeps one binaryen.js script per XML block", () => {
    expect(Object.keys(BLOCK_SCRIPTS).sort()).toEqual(["cos", "oscilloscope", "quantizer", "sin", "timer"]);
    expect(functionText("timer")).toContain("(param $ctx i32)");
    expect(functionText("timer")).toContain("(param $in (ref $c1_f64))");
    expect(functionText("timer")).not.toContain("(result");
    expect(functionText("quantizer")).toContain("(param $in (ref $c1_f64))");
    expect(functionText("quantizer")).toContain("(result (ref $c1_f64))");
    expect(functionText("sin")).toContain("(param $in (ref $c1_f64))");
    expect(functionText("cos")).toContain("(param $in (ref $c1_f64))");
    expect(functionText("oscilloscope")).toContain("(result (ref $array_c1_f64))");
    expect(functionText("oscilloscope")).toContain("array.new_fixed $array_c1_f64");
    expect(functionText("oscilloscope")).not.toContain("(param $in");
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
      for (const port of sig.results) {
        expect(header, id).toContain(`(result $${port.name} ${port.type})`);
      }
    }
  });

  it("assembles every block script into the final module", async () => {
    const { text, wasm } = await assembleModule({
      stages: ["quantizer", "sin"],
      delayMs: 10,
      sharedMemory: true,
    });
    expect(text).toContain("(module");
    expect(text).toContain("(type $c1_f64 (func (param f64)))");
    expect(text).toContain("(type $array_c1_f64 (array (mut (ref $c1_f64))))");
    expect(text).toContain("(func $timer");
    expect(text).toContain("(func $quantizer");
    expect(text).toContain("(func $sin");
    expect(text).toContain("(func $oscilloscope");
    expect(text).toContain("array.new_fixed $array_c1_f64");
    expect(text).toContain("array.get $array_c1_f64");
    expect(text).toContain("call $timer");
    expect(text).toContain("call $oscilloscope");
    expect(text).toContain("call_ref $c1_f64");
    expect(text).toContain("(local $ctx i32)");
    expect(text).toContain("memory.fill");
    expect(text).toContain("memory.atomic.wait32");
    expect(text).not.toContain("(func $tap_0");
    expect(text).toContain(`i32.const ${SAMPLE_CAP}`);
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);

    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    expect(blockTypeWat(blockSignature(diagram.catalog().block("timer")!))).toContain(
      "(type $fn_timer (func (param $ctx i32) (param $in (ref $c1_f64))))",
    );
    expect(blockTypeWat(blockSignature(diagram.catalog().block("oscilloscope")!))).toContain(
      "(type $fn_oscilloscope (func (param $ctx i32) (result $out (ref $array_c1_f64))))",
    );
    expect(runtimeTypeWat()).toContain("(type $fn_timer (func (param $ctx i32) (param $in (ref $c1_f64))))");
    expect(runtimeTypeWat()).toContain(
      "(type $fn_oscilloscope (func (param $ctx i32) (result $out (ref $array_c1_f64))))",
    );
  });

  it("can skip WAT text on the run path", async () => {
    const { text, wasm } = await assembleModule({ stages: ["sin"], delayMs: 10, emitText: false });
    expect(text).toBe("");
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
  });

  it("emits a non-shared memory module that instantiates without COI", async () => {
    const { text, wasm } = await assembleModule({ stages: ["sin"], delayMs: 10, sharedMemory: false });
    expect(text.toLowerCase()).not.toMatch(/\(memory[^\n]*shared/);
    expect(text).not.toContain("i32.atomic");
    expect(text).not.toContain("memory.atomic.wait32");
    const memory = createMemory(false);
    const gen = await instantiateGenerator(wasm, memory, () => 0.5);
    gen.tick();
    expect(readSamples(memory)[0]).toBeCloseTo(Math.sin(0.5));
  });
});
