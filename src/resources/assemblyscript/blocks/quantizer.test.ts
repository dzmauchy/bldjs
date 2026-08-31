import { describe, expect, it } from "vitest";
import { QUANTIZER_AS, emitQuantizer } from "./quantizer";

describe("quantizer catalog", () => {
  it("matches XML c<f64> → c<f64> and parks with atomic.wait<i32>", () => {
    expect(QUANTIZER_AS).toContain("function quantizer(inn: c<f64>): c<f64>");
    expect(QUANTIZER_AS).toContain("return v -> {");
    expect(QUANTIZER_AS).toContain("inn(v);");
    expect(QUANTIZER_AS).toContain("return atomic.wait<i32>(WAIT, 0, load<i64>(CTX + 8));");
  });

  it("emits the same XML signature with a specialized apply", () => {
    const text = emitQuantizer("quantizer", "sin_apply");
    expect(text).toContain("function quantizer(inn: c<f64>): c<f64>");
    expect(text).toContain("sin_apply(v);");
    expect(text).toContain("return quantizer_apply");
    expect(text).not.toContain("atomic.wait");
  });
});
