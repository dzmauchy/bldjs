import { describe, expect, it } from "vitest";
import { arrayOf, consumerType, named, unbounded, unionOf, intersectionOf } from "../ast";
import { Catalog } from "../catalog";
import { getTypeEngine } from "./engine";
import { typeToProlog, typeToSpec, constraintToSpec, prologTermToType } from "./terms";
import { catalogPl } from "./catalog-pl";

describe("Trealla type engine", () => {
  it("meets successive constraints on a type variable", async () => {
    const engine = await getTypeEngine();
    const cat = new Catalog();
    cat.addXml(
      "id.xml",
      `
        <blocks id="t" name="T">
          <block id="id" name="Id" ns="test">
            <var>T</var>
            <in name="in" type="T"/>
            <out name="out" type="T"/>
          </block>
        </blocks>
      `,
    );
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
    cat.addXml(
      "arr.xml",
      `
        <blocks id="t" name="T">
          <block id="arr" name="Arr" ns="test">
            <var>T</var>
            <in name="elems" type="T" vararg="true"/>
            <out name="result" type="array[T]"/>
          </block>
        </blocks>
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
    const cat = new Catalog();
    cat.addXml(
      "id.xml",
      `
        <blocks id="t" name="T">
          <block id="id" name="Id" ns="test">
            <var>T</var>
            <in name="in" type="T"/>
            <out name="out" type="T"/>
          </block>
        </blocks>
      `,
    );
    const src = catalogPl(cat);
    expect(src).toContain(":- assertz(block(id,");
    expect(src).toContain("var('T', none)");
    expect(src).toContain("in(in, v('T'), none, once)");
    expect(src).toContain("out(out, v('T'), none)");
  });

  it("accepts comparable(?(super(T))) on a grounded output", async () => {
    const engine = await getTypeEngine();
    const cat = new Catalog();
    cat.addXml(
      "cmp.xml",
      `
        <blocks id="t" name="T">
          <block id="cmp" name="Cmp" ns="test">
            <var>T</var>
            <in name="in" type="T"/>
            <out name="out" type="T:comparable(?(super(T)))"/>
          </block>
        </blocks>
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
});
