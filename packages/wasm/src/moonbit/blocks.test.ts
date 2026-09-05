import { describe, expect, it } from "vitest";
import { BLOCK_SCRIPTS, QUANTIZER_PERIOD_NS, preamble, TimerMoonBlock } from "./index";
import { CTX_PARAM } from "./types";
import { emitRandom, emitTimer } from "./generators";
import { emitSin } from "./transformers";
import { emitScope } from "./scope";

describe("generator catalog", () => {
  it("repeats the XML signature plus _ctx and leaves spacing to setInterval", () => {
    const source = emitTimer();
    expect(source).toContain(`fn timer(${CTX_PARAM}, input : C1) -> Unit`);
    expect(source).not.toContain("let _ = ctx");
    expect(source).not.toContain("memory.atomic.wait32");
    expect(QUANTIZER_PERIOD_NS).toBe(10_000_000);
    expect(preamble()).toContain('fn js_set_interval(cb : () -> Unit, ms : Int) -> Int = "js" "setInterval"');
    expect(preamble()).toContain("fn stopped() -> Unit");
    expect(preamble()).toContain('extern "wasm" fn i32_atomic_load');
    expect(preamble()).toContain("i32.atomic.load");
  });

  it("samples random through the Math.random browser binding", () => {
    expect(emitRandom()).toContain("math_random()");
    expect(preamble()).toContain('fn math_random() -> Double = "Math" "random"');
  });
});

describe("transformer catalog", () => {
  it("repeats the XML c<f64> → c<f64> signature plus _ctx", () => {
    const source = emitSin();
    expect(source).toContain(`fn sin(${CTX_PARAM}, input : C1) -> C1`);
    expect(source).toContain("math_sin(");
    expect(source).not.toContain("let _ = ctx");
    expect(source).not.toContain("memory.atomic.wait32");
    expect(preamble()).toContain('fn math_sin(x : Double) -> Double = "Math" "sin"');
  });
});

describe("scope catalog", () => {
  it("inlines plot closures instead of named plot functions", () => {
    expect(emitScope()).toContain(`fn scope(${CTX_PARAM}) -> C1`);
    expect(emitScope()).toContain("fn(v : Double) { host_push(v, 0) }");
    expect(emitScope()).not.toContain("scope_plot_");
    expect(emitScope({ length: 2, rings: [0, 1] })).toContain(`fn scope(${CTX_PARAM}) -> (C1, C1)`);
  });
});

describe("MoonBit block library", () => {
  it("covers the runtime XML blocks", () => {
    expect(Object.keys(BLOCK_SCRIPTS).sort()).toEqual(["cos", "random", "scope", "sin", "timer"]);
    expect(new TimerMoonBlock().emit()).toBe(emitTimer());
  });
});
