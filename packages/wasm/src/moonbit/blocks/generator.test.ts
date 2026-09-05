import { describe, expect, it } from "vitest";
import { BLOCK_SCRIPTS, QUANTIZER_PERIOD_NS, preamble } from "../index";
import { emitTimer, emitRandom } from "./generator";
import { emitSin } from "./sin";

describe("generator catalog", () => {
  it("repeats the XML signature plus ctx and leaves spacing to setInterval", () => {
    const source = emitTimer();
    expect(source).toContain("fn timer(ctx : Int, input : C1) -> Unit");
    expect(source).not.toContain("memory.atomic.wait32");
    expect(QUANTIZER_PERIOD_NS).toBe(10_000_000);
    expect(preamble()).toContain('fn js_set_interval(cb : () -> Unit, ms : Int) -> Int = "js" "setInterval"');
  });

  it("samples random through the Math.random browser binding", () => {
    expect(emitRandom()).toContain("math_random()");
    expect(preamble()).toContain('fn math_random() -> Double = "Math" "random"');
  });
});

describe("transformer catalog", () => {
  it("repeats the XML c<f64> → c<f64> signature plus ctx", () => {
    const source = emitSin();
    expect(source).toContain("fn sin(ctx : Int, input : C1) -> C1");
    expect(source).toContain("math_sin(");
    expect(source).not.toContain("memory.atomic.wait32");
    expect(preamble()).toContain('fn math_sin(x : Double) -> Double = "Math" "sin"');
  });
});

describe("MoonBit block library", () => {
  it("covers the runtime XML blocks", () => {
    expect(Object.keys(BLOCK_SCRIPTS).sort()).toEqual(["cos", "random", "scope", "sin", "timer"]);
  });
});
