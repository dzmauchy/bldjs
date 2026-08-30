# XML Schema Definition (XSD) Guide for AI Agents: Representing Types and Blocks

**Purpose:** This document provides rules, constraints, and structural examples for AI agents tasked with generating or parsing the recursive Abstract Syntax Tree (AST) XML schema. The builtin catalog (`types.xml`) is language-agnostic. WASM is a compilation target, not the type language.

## Common types

| Catalog | Meaning | WASM |
| --- | --- | --- |
| `f64` | 64-bit float | `f64` |
| `f32` | 32-bit float | `f32` |
| `i32` | 32-bit int | `i32` |
| `i64` | 64-bit int | `i64` |
| `str` | string | `js-string` (wasm 3.0) |
| `bool` | boolean | `i32` |
| `c1<T>` | consumer | `(func (param T))` |
| `c2<T1, T2>` | consumer | `(func (param T1) (param T2))` |
| `s<R>` | supplier | `(func (result R))` |
| `f1<T, R>` | function | `(func (param T) (result R))` |
| `f2<T1, T2, R>` | function | `(func (param T1) (param T2) (result R))` |
| `T[]` | array | array of `T` |

Display uses the same names (`c1<f64>`, `f1<i32, str>`, `f64[]`), except compact form writes `c1` as `c` so `DoubleConsumer` is shown as `c<f64>`. Nested consumers still print in full (`c<c<f64>>`). `type="f64[]"` and `type="[]"` with a nested `<t>` are both arrays.

## 1. Core Architecture: The Recursive AST
The schema represents type constructs through a strictly lowercase, recursive AST. Types are not flat strings; they are composed of nested XML elements.

The base entity is the **Type Expression** (`t`, `in`, `out`, `extends`, `super`, `ancestor`).
*   **Rule:** Any type expression can endlessly nest other type expressions.
*   **Rule:** If a tag has a `type` attribute (e.g., `<in name="data" type="[]">`), any nested `<t>` elements act as its generic parameters (e.g., `T[]`).

---

## 2. Document Root & Namespaces
The root element is `<blocks>`. It acts as the workspace and contains `<library>`, `<namespace>`, `<type>`, and `<block>` declarations. Catalog XML files declare `blocks.xsd` with `xsi:noNamespaceSchemaLocation`.

```xml
<blocks id="workspace_01" name="Signal Processing" icon="workspace.png"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="blocks.xsd">
  <namespace id="types" name="Types" icon="box.png"/>
  
  <!-- Blocks and Types go here -->
</blocks>
```

---

## 3. Modeling Blocks & Factories
A `<block>` represents an executable node (e.g., a constructor, array op, or typed function).

### Essential Attributes
*   `id`: Unique identifier.
*   `name`: Human-readable name.
*   `ns`: The namespace ID.
*   `icon`: (Optional) Visual identifier. Built-in blocks use SVG files in `../icons` (for example `icon="list.svg"`).

### Factory Binding
The `<factory>` element binds the block to a specific operation.
*   **Rule:** The factory `id` MUST be relative to the block's `ns` attribute (e.g., if block `ns="types"`, factory `id="array#of"`).
*   **Rule:** Pass block `<param>` variables down into the `<factory>` via `<t>` elements to enforce generic type unification.

```xml
<block id="b_apply" name="Apply" ns="types" icon="func.png">
  <!-- Block Generics -->
  <param name="T"/>
  <param name="R"/>
  
  <factory id="f1#apply">
    <t type="T"/>
    <t type="R"/>
  </factory>

  <in name="fn" type="f1">
    <t type="T"/>
    <t type="R"/>
  </in>
  <in name="arg" type="T"/>
  
  <out name="result" type="R"/>
</block>
```

---

## 4. Modeling Types & Generics

### Variance and Wildcards
Variance is handled via the `variance` attribute. Omission implies invariance (exact match).
*   **Covariant (`+`):** `? extends T`
*   **Contravariant (`-`):** `? super T`
*   **Unbounded (`?`):** `?` (Omit the `type` attribute entirely).

```xml
<!-- (? extends i32)[] -->
<in name="covariantInput" type="[]">
  <t type="i32" variance="+"/>
</in>

<!-- c1<? super f64> -->
<in name="contravariantInput" type="c1">
  <t type="f64" variance="-"/>
</in>

<!-- ?[] -->
<in name="unboundedInput" type="[]">
  <t variance="?"/>
</in>
```

### Type Constraints (Bounds)
When defining a `<param>`, use `<extends>` and `<super>` to bound the generic variable.

```xml
<!-- <T rec<T extends>> -->
<param name="T">
  <extends type="rec">
    <t type="T"/>
  </extends>
</param>
```

---

## 5. Modeling functions, consumers, and arrays

`<in>` ports and `<out>` ports carry language-agnostic types. Control Systems uses a pure push model: every consumer is `DoubleConsumer` (`c<f64>`). Compact display writes `c1` as `c`. WASM builder blocks use the same ports: `c1<T>` is `(ref $c1_T)`, and `T[]` is a dynamically sized `(array (mut T))` whose length is the number of outgoing connectors.

```
timer(c)           : c<f64> → void
quantizer(c)       : c<f64> → c<f64>
sin(c) / cos(c)    : c<f64> → c<f64>
oscilloscope()     : c<f64>[]          (dynamically sized vector of plot sinks)
```

Composition is `timer(sin(quantizer(plot[0])))`. Wire Oscilloscope → Quantizer → Sin (or Cos) → Timer. Oscilloscope `out` is a vector of `c<f64>`; each outgoing wire is one channel. Several `c<f64>` outputs may share one input; SolutionBuilder inserts a hidden `fork`:

```
c<f64> fork(c<f64>... downstreams) {
  return v -> { for (c in downstreams) c(v); };
}
```

So two channels from one oscilloscope compile as `timer(fork(sin(plot[0]), cos(plot[1])))`. After Run the chart is a [Chart.js multi-axis line](https://www.chartjs.org/docs/latest/samples/line/multi-axis.html).

```xml
<type name="c1">
  <param name="T"/>
</type>

<block id="timer" name="Timer" ns="com.dauch.cs.gen">
  <factory id="timer"/>
  <in name="in" type="c1">
    <t type="f64"/>
  </in>
</block>

<block id="sin" name="Sin" ns="com.dauch.cs.transform">
  <factory id="f64.sin"/>
  <in name="in" type="c1">
    <t type="f64"/>
  </in>
  <out name="out" type="c1">
    <t type="f64"/>
  </out>
</block>

<block id="oscilloscope" name="Oscilloscope" ns="com.dauch.cs.sink">
  <factory id="oscilloscope"/>
  <out name="out" type="[]">
    <attribute name="dynamic">true</attribute>
    <t type="c1">
      <t type="f64"/>
    </t>
  </out>
</block>
```

SolutionBuilder walks the connected SolutionView and runs the binaryen.js script for each XML block (`resources/binaryen/blocks`), then wires `SolutionViewConnector`s (`array.get` for vector slots, `fork` on fan-in) into one wasm-gc module (`call_ref`). Each Timer worker parks with `memory.atomic.wait32` on a SharedArrayBuffer.

### A. Varargs (`array#of`)
Varargs (e.g., `T... elems`) are marked with the `vararg="true"` boolean attribute on the `<in>` port.

```xml
<block id="b_array_of" name="array" ns="types">
  <param name="T"/>
  
  <factory id="array#of">
    <t type="T"/>
  </factory>

  <in name="elems" type="T" vararg="true"/>
  
  <out name="result" type="[]">
    <t type="T"/>
  </out>
</block>
```

`type="f64[]"` is sugar for the same array type.

### B. Recursive Generics
For F-bounded types such as `<T extends rec<T>>`.

```xml
<block id="b_rec_new" name="rec.new" ns="example">
  <param name="T">
    <extends type="rec">
      <t type="T"/>
    </extends>
  </param>
  
  <in name="cls" type="c1">
    <t type="T"/>
  </in>
  
  <out name="value" type="T"/>
</block>
```

### C. Unions and Intersections
Use `<union>` and `<intersection>` blocks as structural containers. They can replace standard `<t>` elements anywhere in the AST.

```xml
<out name="result">
  <union>
    <t type="i32"/>
    <t type="i64"/>
  </union>
</out>

<in name="complexPayload">
  <intersection>
    <t type="c1">
      <t type="T"/>
    </t>
    <t type="s">
      <t type="T"/>
    </t>
  </intersection>
</in>
```

### D. The Self Type (Builder Patterns)
Use the empty `<self/>` tag to represent the contextual type instance (e.g., `this` in a fluent builder method).

```xml
<block id="b_path" name="path" ns="example.Builder">
  <factory id="Builder#path"/>
  <in name="segment" type="str"/>
  
  <out name="this">
    <self/>
  </out>
</block>
```

---

## 6. Custom Attributes
Any entity in the schema (`blocks`, `block`, `type`, `param`, `in`, `out`, `t`, `factory`, etc.) supports `<attribute name="...">` elements for arbitrary metadata storage. Custom attributes do not require the `#` prefix.

```xml
<block id="b_fetch" name="Fetch Data" ns="com.network">
  <attribute name="description">Executes HTTP GET</attribute>
  
  <in name="url" type="str">
    <attribute name="tooltip">Must be an absolute URL</attribute>
  </in>
</block>
```
