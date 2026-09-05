import { describe, expect, it } from "vitest";
import { BLOCK_SCRIPTS, QUANTIZER_PERIOD_NS, preamble, TimerMoonBlock } from "./index";
import { CTX_PARAM } from "./types";
import { emitConstant, emitRandom, emitTimer } from "./generators";
import { emitGpioIn, emitGpioOut } from "./gpio";
import { emitProduct } from "./combiners";
import { emitOvershoot, emitSin } from "./transformers";
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

  it("bakes the constant value into input", () => {
    expect(emitConstant()).toContain(`fn constant(${CTX_PARAM}, input : C1) -> Unit`);
    expect(emitConstant()).toContain("input(1.0)");
    expect(emitConstant({ value: 2.5 })).toContain("input(2.5)");
  });
});

describe("transformer catalog", () => {
  it("repeats the XML (Double) -> Unit → (Double) -> Unit signature plus _ctx", () => {
    const source = emitSin();
    expect(source).toContain(`fn sin(${CTX_PARAM}, input : C1) -> C1`);
    expect(source).toContain("math_sin(");
    expect(source).not.toContain("let _ = ctx");
    expect(source).not.toContain("memory.atomic.wait32");
    expect(preamble()).toContain('fn math_sin(x : Double) -> Double = "Math" "sin"');
  });

  it("bakes ζ and ω, then maps with runtime ωd = ω√(1−ζ²)", () => {
    const source = emitOvershoot({ zeta: 0.5, omega: 2 });
    expect(source).toContain(`fn overshoot(${CTX_PARAM}, input : C1) -> C1`);
    expect(source).toContain("let zeta = 0.5");
    expect(source).toContain("let w = 2.0");
    expect(source).toContain("w * math_sqrt(1.0 - zeta * zeta)");
    expect(source).toContain("math_exp(");
    expect(source).toContain("math_sin(");
    expect(source).toContain("math_cos(");
    expect(source).not.toContain("-0.5 * t");
    expect(source).toContain("let clock_overshoot");
    expect(source).not.toContain("let _ = ctx");
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

describe("product catalog", () => {
  it("returns n factor consumers that share def-initialized slots", () => {
    const source = emitProduct({ length: 2, def: 1 });
    expect(source).toContain(`fn product(${CTX_PARAM}, input : C1) -> (C1, C1)`);
    expect(source).toContain("v0: 1.0");
    expect(source).toContain("v1: 1.0");
    expect(source).toContain("state_product.v0 = v");
    expect(source).toContain("input(state_product.v0 * state_product.v1)");
    expect(emitProduct({ length: 1, def: 0.5 })).toContain(`fn product(${CTX_PARAM}, input : C1) -> C1`);
  });
});

describe("MoonBit block library", () => {
  it("covers the runtime XML blocks", () => {
    expect(Object.keys(BLOCK_SCRIPTS).sort()).toEqual([
      "constant",
      "cos",
      "gpio_in",
      "gpio_out",
      "overshoot",
      "product",
      "random",
      "scope",
      "sin",
      "timer",
    ]);
    expect(new TimerMoonBlock().emit()).toBe(emitTimer());
  });
});

describe("GPIO catalog", () => {
  it("bakes pin numbers into pin_read and pin_write", () => {
    expect(emitGpioIn({ pin: 4 })).toContain("host_pin_read(4)");
    expect(emitGpioIn({ pin: 4 })).toContain("if host_pin_read(4) != 0 { 1.0 } else { 0.0 }");
    expect(emitGpioIn()).not.toContain("to_double");
    expect(emitGpioOut({ pin: 13 })).toContain("host_pin_write(13,");
  });
});
