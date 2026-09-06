import { describe, expect, it } from "vitest";
import { arrayOf, consumerType, named, unbounded, unionOf, intersectionOf } from "../ast";
import { Catalog } from "../catalog";
import { getTypeEngine } from "./engine";
import { typeToProlog, typeToSpec, constraintToSpec, prologTermToType } from "./terms";
import { blockFact } from "./catalog-pl";

function idCatalog(): Catalog {
  const cat = new Catalog();
  cat.addPl(
    "id.pl",
    `
      catalog(t, 'T').
      block(id, 'Id', none, [ns(test), var('T', none)]).
      input(id, in, in, v('T'), []).
      output(id, out, out, v('T'), []).
    `,
  );
  return cat;
}

describe("Trealla type engine", () => {
  it("meets successive constraints on a type variable", async () => {
    const engine = await getTypeEngine();
    const cat = idCatalog();
    const block = cat.block("id")!;
    const once = await engine.infer(
      block,
      new Map([["in", { kind: "single", ty: named("double") }]]),
      cat,
    );
    expect(once.vars.get("T")?.equals(named("double"))).toBe(true);
    expect(once.outputs[0]?.connectable).toBe(true);

    const both = await engine.infer(
      block,
      new Map([
        ["in", { kind: "single", ty: intersectionOf([named("double"), named("int")]) }],
      ]),
      cat,
    );
    expect(both.compatible.get("in")).toBe(true);
  });

  it("joins vararg groundings and leaves unbound outputs unconnectable", async () => {
    const engine = await getTypeEngine();
    const cat = new Catalog();
    cat.addPl(
      "arr.pl",
      `
        catalog(t, 'T').
        block(arr, 'Arr', none, [ns(test), var('T', none)]).
        input(arr, elems, elems, v('T'), [vararg]).
        output(arr, result, result, array(v('T')), []).
      `,
    );
    const block = cat.block("arr")!;
    const inferred = await engine.infer(
      block,
      new Map([["elems", { kind: "varargs", items: [named("double"), named("int")] }]]),
      cat,
    );
    expect(inferred.outputs[0]?.ty.equals(arrayOf(unionOf([named("double"), named("int")])))).toBe(true);
    expect(inferred.outputs[0]?.connectable).toBe(true);

    const free = await engine.infer(block, new Map(), cat);
    expect(free.outputs[0]?.ty.equals(unbounded()) || free.outputs[0]?.ty.equals(arrayOf(unbounded()))).toBe(
      true,
    );
    expect(free.outputs[0]?.connectable).toBe(false);
  });

  it("treats a consumer vector as compatible with a consumer formal", async () => {
    const engine = await getTypeEngine();
    const formal = consumerType(named("double"));
    const actual = arrayOf(consumerType(named("double")));
    expect(await engine.compatible(formal, actual)).toBe(true);
    expect(await engine.compatible(formal, named("double"))).toBe(false);
  });

  it("round-trips catalog type terms through Prolog", () => {
    const vars = new Set(["T"]);
    const ty = consumerType(named("T"));
    expect(typeToProlog(ty, vars)).toBe("fn([T], unit)");
    expect(typeToSpec(ty, vars)).toBe("fn([v('T')], unit)");
    expect(constraintToSpec("comparable(?(super(T)))", vars)).toBe("comparable(?(super(v('T'))))");
    expect(prologTermToType({ functor: "top", args: [] }).equals(unbounded())).toBe(true);
  });

  it("writes block/4 facts keyed by id", () => {
    const cat = idCatalog();
    const src = blockFact(cat.block("id")!);
    expect(src).toContain("block(id,");
    expect(src).toContain("var('T', none)");
  });

  it("accepts comparable(?(super(T))) on a grounded output", async () => {
    const engine = await getTypeEngine();
    const cat = new Catalog();
    cat.addPl(
      "cmp.pl",
      `
        catalog(t, 'T').
        block(cmp, 'Cmp', none, [ns(test), var('T', none)]).
        input(cmp, in, in, v('T'), []).
        output(cmp, out, out, v('T'), [constraint(comparable(?(super(v('T')))))]).
      `,
    );
    const inferred = await engine.infer(
      cat.block("cmp")!,
      new Map([["in", { kind: "single", ty: named("double") }]]),
      cat,
    );
    expect(inferred.compatible.get("in")).toBe(true);
    expect(inferred.outputs[0]?.ty.equals(named("double"))).toBe(true);
    expect(inferred.outputs[0]?.connectable).toBe(true);
  });

  it("swaps catalogs on one engine without a second consult", async () => {
    const engine = await getTypeEngine();
    const first = idCatalog();
    const second = new Catalog();
    second.addPl(
      "merge.pl",
      `
        catalog(t, 'T').
        block(merge, 'Merge', none, [ns(test), var('T', none)]).
        input(merge, a, a, v('T'), []).
        input(merge, b, b, v('T'), []).
        output(merge, out, out, v('T'), []).
      `,
    );
    const idOnce = await engine.infer(
      first.block("id")!,
      new Map([["in", { kind: "single", ty: named("double") }]]),
      first,
    );
    expect(idOnce.outputs[0]?.ty.equals(named("double"))).toBe(true);

    const merged = await engine.infer(
      second.block("merge")!,
      new Map([
        ["a", { kind: "single", ty: named("double") }],
        ["b", { kind: "single", ty: named("int") }],
      ]),
      second,
    );
    expect(merged.vars.get("T")?.equals(intersectionOf([named("double"), named("int")]))).toBe(true);
    expect(merged.compatible.get("a")).toBe(true);
    expect(merged.compatible.get("b")).toBe(true);
  });
});
