import { describe, expect, it } from "vitest";
import { emitEmbeddedMath } from "./math";

describe("embedded MCU math", () => {
  it("uses only primitive Double ops (no core stdlib % or to_double)", () => {
    const source = emitEmbeddedMath({ sin: true, cos: true, random: true, exp: true, sqrt: true });
    expect(source).toContain("fn math_sin(rad : Double) -> Double");
    expect(source).toContain("fn math_cos(rad : Double) -> Double");
    expect(source).toContain("fn math_random() -> Double");
    expect(source).toContain("fn math_exp(x : Double) -> Double");
    expect(source).toContain("fn math_sqrt(x : Double) -> Double");
    expect(source).toContain("rem_two_pi");
    expect(source).not.toContain("to_double");
    expect(source).not.toContain(" % ");
  });

  it("omits unused helpers", () => {
    expect(emitEmbeddedMath({ sin: true, cos: true, random: true })).not.toContain("math_exp");
    expect(emitEmbeddedMath({ exp: true })).toContain("fn math_exp(x : Double) -> Double");
    expect(emitEmbeddedMath({ sqrt: true })).toContain("fn math_sqrt(x : Double) -> Double");
    expect(emitEmbeddedMath({ exp: true, sqrt: true })).not.toContain("to_double");
    expect(emitEmbeddedMath({ exp: true, sqrt: true })).not.toContain(" % ");
    expect(emitEmbeddedMath({ sin: true })).not.toContain("math_random");
    expect(emitEmbeddedMath({ sin: true })).not.toContain("math_cos");
    expect(emitEmbeddedMath()).toBe("");
  });
});
