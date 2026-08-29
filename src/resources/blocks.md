# XML Schema Definition (XSD) Guide for AI Agents: Representing Types and Blocks

**Purpose:** This document provides rules, constraints, and structural examples for AI agents tasked with generating or parsing the recursive Abstract Syntax Tree (AST) XML schema. The builtin catalog is WebAssembly (`wasm.xml`): value types, reference types, and typed functions (`func<T>`).

## 1. Core Architecture: The Recursive AST
The schema represents type constructs through a strictly lowercase, recursive AST. Types are not flat strings; they are composed of nested XML elements.

The base entity is the **Type Expression** (`t`, `in`, `out`, `extends`, `super`, `ancestor`).
*   **Rule:** Any type expression can endlessly nest other type expressions.
*   **Rule:** If a tag has a `type` attribute (e.g., `<in name="data" type="table">`), any nested `<t>` elements act as its generic parameters (e.g., `table<T>`).

---

## 2. Document Root & Namespaces
The root element is `<blocks>`. It acts as the workspace and contains `<library>`, `<namespace>`, `<type>`, and `<block>` declarations.

```xml
<blocks id="workspace_01" name="Signal Processing" icon="workspace.png">
  <namespace id="wasm" name="WebAssembly" icon="box.png"/>
  
  <!-- Blocks and Types go here -->
</blocks>
```

---

## 3. Modeling Blocks & Factories
A `<block>` represents an executable node (e.g., a constructor, table op, or typed function).

### Essential Attributes
*   `id`: Unique identifier.
*   `name`: Human-readable name.
*   `ns`: The namespace ID.
*   `icon`: (Optional) Visual identifier. Built-in blocks use SVG files in `src/resources/icons/` (for example `icon="map.svg"`).

### Factory Binding
The `<factory>` element binds the block to a specific operation.
*   **Rule:** The factory `id` MUST be relative to the block's `ns` attribute (e.g., if block `ns="wasm"`, factory `id="table#new"`).
*   **Rule:** Pass block `<param>` variables down into the `<factory>` via `<t>` elements to enforce generic type unification.

```xml
<block id="b_create_map" name="Create Map" ns="wasm" icon="map.png">
  <!-- Block Generics -->
  <param name="K"/>
  <param name="V"/>
  
  <!-- Factory binding relative to wasm -->
  <factory id="map#of">
    <t type="K"/>
    <t type="V"/>
  </factory>

  <in name="key" type="K"/>
  <in name="val" type="V"/>
  
  <out name="result" type="map">
    <t type="K"/>
    <t type="V"/>
  </out>
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
<!-- table<? extends i32> -->
<in name="covariantInput" type="table">
  <t type="i32" variance="+"/>
</in>

<!-- func<? super f64> -->
<in name="contravariantInput" type="func">
  <t type="f64" variance="-"/>
</in>

<!-- table<?> -->
<in name="unboundedInput" type="table">
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

## 5. Modeling WASM typed functions

A typed function is `func<T>`: WASM `(type (func (param T)))`. Nested consumers are nested `func` types:

```
timer()      : func<func<func<f64>>>
quantizer(_) : func<func<f64>>
sin(_)       : func<f64>
```

Compact display uses `fn` for `func`, so Timer is `fn<fn<fn<f64>>>`.

```xml
<type name="func" ns="wasm">
  <param name="T"/>
  <ancestor type="funcref"/>
</type>

<block id="timer" name="Timer" ns="cs">
  <out name="out" type="func">
    <t type="func">
      <t type="func">
        <t type="f64"/>
      </t>
    </t>
  </out>
</block>
```

Run compiles each generator pipeline to WAT with a `$fn_f64` type, `call` / table `funcref` entries, then `wat2wasm` (wabt). Each Timer is bound to a worker.

### A. Varargs (`table.new`)
Varargs (e.g., `T... elems`) are marked with the `vararg="true"` boolean attribute on the `<in>` port.

```xml
<block id="b_table_of" name="table" ns="wasm">
  <param name="T"/>
  
  <factory id="table#new">
    <t type="T"/>
  </factory>

  <in name="elems" type="T" vararg="true"/>
  
  <out name="result" type="table">
    <t type="T"/>
  </out>
</block>
```

### B. Recursive Generics
For F-bounded types such as `<T extends rec<T>>`.

```xml
<block id="b_rec_new" name="rec.new" ns="wasm">
  <param name="T">
    <extends type="rec">
      <t type="T"/>
    </extends>
  </param>
  
  <in name="cls" type="func">
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
    <t type="funcref"/>
    <t type="func">
      <t type="T"/>
    </t>
  </intersection>
</in>
```

### D. The Self Type (Builder Patterns)
Use the empty `<self/>` tag to represent the contextual type instance (e.g., `this` in a fluent builder method).

```xml
<block id="b_path" name="path" ns="wasm.module.Builder">
  <factory id="Builder#path"/>
  <in name="segment" type="externref"/>
  
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
  
  <in name="url" type="externref">
    <attribute name="tooltip">Must be an absolute URL</attribute>
  </in>
</block>
```
