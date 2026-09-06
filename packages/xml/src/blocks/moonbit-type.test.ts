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
    expect(typesEqual(ty("double"), named("double"))).toBe(true);
    expect(typesEqual(ty("array[T]"), arrayOf(named("T")))).toBe(true);
    expect(typesEqual(ty("array[_]"), arrayOf(unbounded()))).toBe(true);
    expect(ty("_").kind).toBe("hole");
    expect(ty("self").kind).toBe("self");
  });

  it("parses function types", () => {
    expect(typesEqual(ty("(double) -> unit"), consumerType(named("double")))).toBe(true);
    expect(typesEqual(ty("() -> double"), funcType([], named("double")))).toBe(true);
    expect(typesEqual(ty("(int, string) -> bool"), funcType([named("int"), named("string")], named("bool")))).toBe(
      true,
    );
    expect(typesEqual(ty("double -> unit"), consumerType(named("double")))).toBe(true);
  });

  it("parses unions, intersections, and options", () => {
    expect(typesEqual(ty("int | int64"), unionOf([named("int"), named("int64")]))).toBe(true);
    expect(ty("((T) -> unit) & (() -> T)").kind).toBe("intersection");
    expect(displayType(ty("int?"), true)).toBe("Option[int]");
  });

  it("round-trips catalog types", () => {
    for (const src of ["(double) -> unit", "array[(double) -> unit]", "array[T]", "(T1, T2) -> R"]) {
      expect(displayType(ty(src), true)).toBe(src);
    }
  });

  it("rejects trailing junk", () => {
    expect(() => ty("double double")).toThrow(/unexpected/);
  });
});
