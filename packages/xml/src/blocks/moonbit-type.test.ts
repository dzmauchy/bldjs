import { describe, expect, it } from "vitest";
import {
  arrayOf,
  consumerType,
  displayType,
  funcType,
  named,
  typesEqual,
  unbounded,
  unionOf,
} from "./ast";
import { parseMoonbitType } from "./moonbit-type";

function ty(src: string) {
  return parseMoonbitType(src);
}

describe("MoonBit type notation", () => {
  it("parses primitives, arrays, and holes", () => {
    expect(typesEqual(ty("Double"), named("Double"))).toBe(true);
    expect(typesEqual(ty("Array[T]"), arrayOf(named("T")))).toBe(true);
    expect(typesEqual(ty("Array[_]"), arrayOf(unbounded()))).toBe(true);
    expect(ty("_").kind).toBe("hole");
    expect(ty("Self").kind).toBe("self");
  });

  it("parses function types", () => {
    expect(typesEqual(ty("(Double) -> Unit"), consumerType(named("Double")))).toBe(true);
    expect(typesEqual(ty("() -> Double"), funcType([], named("Double")))).toBe(true);
    expect(typesEqual(ty("(Int, String) -> Bool"), funcType([named("Int"), named("String")], named("Bool")))).toBe(
      true,
    );
    expect(typesEqual(ty("Double -> Unit"), consumerType(named("Double")))).toBe(true);
  });

  it("parses unions, intersections, and options", () => {
    expect(typesEqual(ty("Int | Int64"), unionOf([named("Int"), named("Int64")]))).toBe(true);
    expect(ty("((T) -> Unit) & (() -> T)").kind).toBe("intersection");
    expect(displayType(ty("Int?"), true)).toBe("Option[Int]");
  });

  it("round-trips catalog types", () => {
    for (const src of ["(Double) -> Unit", "Array[(Double) -> Unit]", "Array[T]", "(T1, T2) -> R"]) {
      expect(displayType(ty(src), true)).toBe(src);
    }
  });

  it("rejects trailing junk", () => {
    expect(() => ty("Double Double")).toThrow(/unexpected/);
  });
});
