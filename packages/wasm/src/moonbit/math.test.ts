import { describe, expect, it } from "vitest";
import { emitEmbeddedMath } from "./math";

describe("embedded MCU math", () => {
  it("uses only primitive Double ops (no core stdlib % or to_double)", () => {
    const source = emitEmbeddedMath({ sin: true, cos: true, random: true });
    expect(source).toContain("fn math_sin(rad : Double) -> Double");
    expect(source).toContain("fn math_cos(rad : Double) -> Double");
    expect(source).toContain("fn math_random() -> Double");
    expect(source).toContain("rem_two_pi");
    expect(source).not.toContain("to_double");
    expect(source).not.toContain(" % ");
  });

  it("omits unused helpers", () => {
    expect(emitEmbeddedMath({ random: true })).not.toContain("math_sin");
    expect(emitEmbeddedMath({ sin: true })).not.toContain("math_random");
    expect(emitEmbeddedMath()).toBe("");
  });
});
