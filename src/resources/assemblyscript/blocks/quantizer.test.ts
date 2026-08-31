import { describe, expect, it } from "vitest";
import { QUANTIZER_AS, emitQuantizer } from "./quantizer";

describe("quantizer catalog", () => {
  it("returns a consumer that forwards then parks with atomic.wait<i32>", () => {
    expect(QUANTIZER_AS).toContain("function quantizer(period: i32, in: c<f64>): c<f64>");
    expect(QUANTIZER_AS).toContain("return v -> {");
    expect(QUANTIZER_AS).toContain("in(v);");
    expect(QUANTIZER_AS).toContain("return atomic.wait<i32>(WAIT, 0, i64(period) * 1_000_000);");
  });

  it("specializes the catalog closure into a direct apply", () => {
    const text = emitQuantizer("quantizer", "sin");
    expect(text).toContain("function quantizer(v: f64): void");
    expect(text).toContain("sin(v);");
    expect(text).not.toContain("atomic.wait");
  });
});
