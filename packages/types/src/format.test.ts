import { describe, expect, it } from "vitest";
import {
  arrayOf,
  consumerType,
  funcType,
  generic,
  intersectionOf,
  named,
  unionOf,
  wildcard,
  wildcardExtends,
  wildcardSuper,
} from "./ast";
import { formatType } from "./format";

describe("formatType", () => {
  it("formats primitive and raw types", () => {
    expect(formatType(named("f32"))).toBe("f32");
    expect(formatType(named("bool"))).toBe("bool");
    expect(formatType(named("Animal"))).toBe("Animal");
  });

  it("formats consumer / function types from c0, c1, c2, f0, f1, f2", () => {
    expect(formatType(named("c0"))).toBe("() -> void");
    expect(formatType(generic("c1", [named("f32")]))).toBe("(f32) -> void");
    expect(formatType(generic("c2", [named("f32"), named("f32")]))).toBe("(f32, f32) -> void");
    expect(formatType(generic("f0", [named("f32")]))).toBe("() -> f32");
    expect(formatType(generic("f1", [named("i32"), named("bool")]))).toBe("(i32) -> bool");
    expect(formatType(generic("f2", [named("i32"), named("i32"), named("bool")]))).toBe("(i32, i32) -> bool");
  });

  it("formats generic containers", () => {
    expect(formatType(arrayOf(named("T")))).toBe("Array[T]");
    expect(formatType(arrayOf(generic("c1", [named("f32")]))))
      .toBe("Array[(f32) -> void]");
  });

  it("formats funcType and consumerType AST directly", () => {
    expect(formatType(consumerType(named("f32")))).toBe("(f32) -> void");
    expect(formatType(funcType([named("i32")], named("bool")))).toBe("(i32) -> bool");
  });

  it("formats wildcards with only + and - variance", () => {
    expect(formatType(wildcard())).toBe("?");
    expect(formatType(wildcard(named("Number"), "+"))).toBe("? extends Number");
    expect(formatType(wildcard(named("Integer"), "-"))).toBe("? super Integer");
    expect(formatType(wildcardExtends(named("Animal")))).toBe("? extends Animal");
    expect(formatType(wildcardSuper(named("Cat")))).toBe("? super Cat");
  });

  it("formats unions and intersections", () => {
    expect(formatType(intersectionOf([named("A"), named("B")]))).toBe("A & B");
    expect(formatType(unionOf([named("A"), named("B")]))).toBe("A | B");
  });
});
