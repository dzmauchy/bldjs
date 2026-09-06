import { describe, expect, it } from "vitest";
import {
  type BlockDef,
  arrayOf,
  generic,
  intersectionOf,
  named,
  unionOf,
  wildcard,
  wildcardExtends,
  wildcardSuper,
} from "./ast";
import { Catalog } from "./catalog";
import { isCompatible } from "./compat";
import {
  TypeResolver,
  inferCommonType,
  inferIntersection,
  inferUnion,
  simplifyIntersection,
  simplifyUnion,
} from "./resolve";

describe("Type inference for blocks", () => {
  const cat = new Catalog();
  cat.addDoc({
    id: "test",
    name: "Test",
    source: "test.xml",
    namespaces: [],
    types: [
      {
        name: "Animal",
        ns: null,
        vars: [],
        params: [],
        ancestors: [],
        attributes: [],
        source: "test.xml",
      },
      {
        name: "Cat",
        ns: null,
        vars: [],
        params: [],
        ancestors: [named("Animal")],
        attributes: [],
        source: "test.xml",
      },
      {
        name: "Dog",
        ns: null,
        vars: [],
        params: [],
        ancestors: [named("Animal")],
        attributes: [],
        source: "test.xml",
      },
    ],
    blocks: [],
    attributes: [],
    icon: null,
  });

  it("checks compatibility with subtyping", () => {
    expect(isCompatible(cat, [], named("Animal"), named("Cat"))).toBe(true);
    expect(isCompatible(cat, [], named("Animal"), named("Dog"))).toBe(true);
    expect(isCompatible(cat, [], named("Cat"), named("Dog"))).toBe(false);
  });

  it("checks wildcard compatibility with + and - variance", () => {
    // Upper bound (+)
    expect(isCompatible(cat, [], wildcard(named("Animal"), "+"), named("Cat"))).toBe(true);
    expect(isCompatible(cat, [], wildcardExtends(named("Animal")), named("Cat"))).toBe(true);
    // Lower bound (-)
    expect(isCompatible(cat, [], wildcard(named("Cat"), "-"), named("Animal"))).toBe(true);
    expect(isCompatible(cat, [], wildcardSuper(named("Cat")), named("Animal"))).toBe(true);
    // Unbounded
    expect(isCompatible(cat, [], wildcard(), named("Cat"))).toBe(true);
  });

  it("simplifies intersections and unions", () => {
    // Cat is subtype of Animal, so Cat & Animal simplifies to Cat
    expect(simplifyIntersection([named("Cat"), named("Animal")], cat).equals(named("Cat"))).toBe(true);
    // Cat | Animal simplifies to Animal
    expect(simplifyUnion([named("Cat"), named("Animal")], cat).equals(named("Animal"))).toBe(true);
  });

  it("infers common types using intersection and union strategies", () => {
    expect(inferCommonType([named("Cat"), named("Animal")], { strategy: "intersection", catalog: cat }).equals(named("Cat"))).toBe(true);
    expect(inferCommonType([named("Cat"), named("Animal")], { strategy: "union", catalog: cat }).equals(named("Animal"))).toBe(true);
    expect(inferIntersection([named("Cat"), named("Animal")], cat).equals(named("Cat"))).toBe(true);
    expect(inferUnion([named("Cat"), named("Animal")], cat).equals(named("Animal"))).toBe(true);
  });

  it("resolves block type parameters from grounded inputs", () => {
    const resolver = new TypeResolver(cat);
    const block: BlockDef = {
      id: "identity",
      name: "Identity",
      ns: "flow",
      icon: null,
      vars: [{ name: "T", extends: [], attributes: [] }],
      params: [{ name: "T", extends: [], attributes: [] }],
      parameters: [],
      factory: null,
      inputs: [{ name: "in", ty: named("T"), vararg: false, icon: null, attributes: [] }],
      outputs: [{ name: "out", ty: named("T"), vararg: false, icon: null, attributes: [] }],
      attributes: [],
      source: "test.xml",
    };

    const grounded = new Map([["in", { kind: "single" as const, ty: named("Cat") }]]);
    const resolved = resolver.resolve(block, grounded);

    expect(resolved.params.get("T")?.equals(named("Cat"))).toBe(true);
    expect(resolved.inputs[0]?.ty.equals(named("Cat"))).toBe(true);
    expect(resolved.outputs[0]?.ty.equals(named("Cat"))).toBe(true);
    expect(resolved.compatible.get("in")).toBe(true);
  });

  it("resolves block with consumer types c1", () => {
    const resolver = new TypeResolver(cat);
    const block: BlockDef = {
      id: "sin",
      name: "Sin",
      ns: "cs",
      icon: null,
      vars: [],
      params: [],
      parameters: [],
      factory: null,
      inputs: [{ name: "in", ty: generic("c1", [named("f32")]), vararg: false, icon: null, attributes: [] }],
      outputs: [{ name: "out", ty: generic("c1", [named("f32")]), vararg: false, icon: null, attributes: [] }],
      attributes: [],
      source: "cs.xml",
    };

    const grounded = new Map([["in", { kind: "single" as const, ty: generic("c1", [named("f32")]) }]]);
    const resolved = resolver.resolve(block, grounded);

    expect(resolved.inputs[0]?.ty.equals(generic("c1", [named("f32")]))).toBe(true);
    expect(resolved.compatible.get("in")).toBe(true);
  });
});
