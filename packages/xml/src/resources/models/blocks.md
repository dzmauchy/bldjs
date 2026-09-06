# Prolog catalogs: types and blocks

Types and blocks are defined in Prolog. Diagrams stay XML (`diagram.xsd`).

Trealla loads, in order:

1. `packages/xml/src/blocks/prolog/types.pl` — type catalog + `library(atts)` inference
2. `packages/xml/src/blocks/prolog/blocks.pl` — block catalog + `infer_block/3`

A diagram lists those files under `<catalogs>`:

```xml
<catalogs>
    <catalog>types.pl</catalog>
    <catalog>blocks.pl</catalog>
</catalogs>
```

## types.pl

```prolog
catalog(types, 'Types').

type(double, '64-bit IEEE float').
type(uint64, '64-bit unsigned integer').
type(array, 'homogeneous array').
var(array, 'T', none).

parent(color, rec(color)).
```

Raw type names are camelCase atoms: `double`, `float`, `int`, `int64`, `uint`, `uint64`, `string`, `bool`, `unit`. Compound terms:

* `array(T)`
* `fn([T1, T2], R)` — `(T1, T2) -> R`
* `v('T')` — a block or type variable
* `top` — hole `_`
* `inter(A, B)`, `union(A, B)`

Constraints on vars and ports: `extends(...)`, `comparable(?(super(T)))`, `?(Constraint)`.

## blocks.pl

```prolog
catalog(cs, 'Control Systems').
ns('com.dauch.cs.tf', 'Transform', 'com.dauch.cs').

block(sin, 'Sin', sin, [
    ns('com.dauch.cs.tf'),
    kind('Process'),
    description('Transformer. Maps each sample with sin.')
]).
input(sin, in, in, fn([double], unit), []).
output(sin, out, out, fn([double], unit), []).

block(b_array_of, array, list, [
    ns(types),
    kind(process),
    var('T', none)
]).
input(b_array_of, elems, elems, v('T'), [vararg]).
output(b_array_of, result, result, array(v('T')), []).
```

* `block(Id, Name, Icon, Attrs)` — `id` is the asm / MoonBit generator id
* `input(Block, Id, Name, Type, Attrs)` / `output/5`
* `param(Block, Name, Kind, Attrs)` — `integer_range`, `double_range`, …
* Attrs may include `ns/1`, `kind/1`, `description/1`, `runnable`, `generator`, `combiner`, `var(Name, Constraint)`, `vararg`, `constraint/1`, `dynamic`

Shared type variables across inputs meet (`A & B`). Vararg groundings join (`A | B`). An output that still has free type variables is not connectable.

`infer_block(Id, Grounded, Result)` looks up those facts by block id.
