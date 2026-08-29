import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { BLOCK_WAT, assembleWat, blockTypeWat } from "./assemble";
import { blockSignature, signatureWat } from "./signatures";

describe("block WAT assembly", () => {
  it("keeps one WAT file per runtime block", () => {
    expect(Object.keys(BLOCK_WAT).sort()).toEqual(["oscilloscope", "quantizer", "sin", "timer"]);
    expect(BLOCK_WAT.timer).toContain("(param $ctx i32)");
    expect(BLOCK_WAT.timer).toContain("(result $out f64)");
    expect(BLOCK_WAT.quantizer).toContain("(param $in f64)");
    expect(BLOCK_WAT.quantizer).toContain("(result $out f64)");
    expect(BLOCK_WAT.sin).toContain("(param $in f64)");
    expect(BLOCK_WAT.oscilloscope).toContain("(param $in f64)");
    expect(BLOCK_WAT.oscilloscope).not.toContain("(result");
  });

  it("matches XML port names in each block file", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();
    for (const [id, wat] of Object.entries(BLOCK_WAT)) {
      const header = signatureWat(blockSignature(cat.block(id)!));
      const ports = header.replace(`(func $${id} `, "");
      expect(wat, id).toContain(ports);
    }
  });

  it("assembles every block file into the final module", () => {
    const wat = assembleWat({ stages: ["quantizer", "sin"], delayMs: 10 });
    expect(wat.startsWith("(module")).toBe(true);
    expect(wat).toContain('(func $timer (export "timer") (type $fn_timer) (param $ctx i32) (result $out f64)');
    expect(wat).toContain('(func $quantizer (export "quantizer") (type $fn_quantizer) (param $ctx i32) (param $in f64) (result $out f64)');
    expect(wat).toContain('(func $sin (export "sin") (type $fn_sin) (param $ctx i32) (param $in f64) (result $out f64)');
    expect(wat).toContain('(func $oscilloscope (export "oscilloscope") (type $fn_oscilloscope) (param $ctx i32) (param $in f64)');
    expect(wat).toContain("call_ref $fn_quantizer");
    expect(wat).toContain("call_ref $fn_sin");
    expect(wat).toContain("call_ref $fn_oscilloscope");
    expect(wat).toContain("(local $ctx i32)");
    expect(wat).toContain("memory.atomic.wait32");

    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    expect(blockTypeWat(blockSignature(diagram.catalog().block("timer")!))).toContain(
      "(type $fn_timer (func (param $ctx i32) (result $out f64)))",
    );
  });
});
