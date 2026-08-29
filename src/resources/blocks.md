# XML Schema Definition (XSD) Guide for AI Agents: Representing Java 21 Types and Blocks

**Purpose:** This document provides rules, constraints, and structural examples for AI agents tasked with generating or parsing the recursive Abstract Syntax Tree (AST) XML schema for Java 21 models.

## 1. Core Architecture: The Recursive AST
The schema represents Java 21 constructs through a strictly lowercase, recursive AST. Types are not flat strings; they are composed of nested XML elements.

The base entity is the **Type Expression** (`t`, `in`, `out`, `extends`, `super`, `ancestor`).
*   **Rule:** Any type expression can endlessly nest other type expressions.
*   **Rule:** If a tag has a `type` attribute (e.g., `<in name="data" type="List">`), any nested `<t>` elements act as its generic parameters (e.g., `List<T>`).

---

## 2. Document Root & Namespaces
The root element is `<blocks>`. It acts as the workspace and contains `<library>`, `<namespace>`, `<type>`, and `<block>` declarations.

```xml
<blocks id="workspace_01" name="Data Processing" icon="workspace.png">
  <namespace id="java.util" name="Java Utilities" icon="box.png"/>
  
  <!-- Blocks and Types go here -->
</blocks>
```

---

## 3. Modeling Blocks & Factories
A `<block>` represents an executable node (e.g., a method call, constructor, or factory).

### Essential Attributes
*   `id`: Unique identifier.
*   `name`: Human-readable name.
*   `ns`: The namespace ID.
*   `icon`: (Optional) Visual identifier.

### Factory Binding
The `<factory>` element binds the block to a specific Java method.
*   **Rule:** The factory `id` MUST be relative to the block's `ns` attribute (e.g., if block `ns="java.util"`, factory `id="List#of"`).
*   **Rule:** Pass block `<param>` variables down into the `<factory>` via `<t>` elements to enforce generic type unification.

```xml
<block id="b_create_map" name="Create Map" ns="java.util" icon="map.png">
  <!-- Block Generics -->
  <param name="K"/>
  <param name="V"/>
  
  <!-- Factory binding relative to java.util -->
  <factory id="Map#of">
    <t type="K"/>
    <t type="V"/>
  </factory>

  <in name="key" type="K"/>
  <in name="val" type="V"/>
  
  <out name="result" type="Map">
    <t type="K"/>
    <t type="V"/>
  </out>
</block>
```

---

## 4. Modeling Java Types & Generics

### Variance and Wildcards
Variance is handled via the `variance` attribute. Omission implies invariance (exact match).
*   **Covariant (`+`):** `? extends T`
*   **Contravariant (`-`):** `? super T`
*   **Unbounded (`?`):** `?` (Omit the `type` attribute entirely).

```xml
<!-- List<? extends Number> -->
<in name="covariantInput" type="List">
  <t type="Number" variance="+"/>
</in>

<!-- Consumer<? super String> -->
<in name="contravariantInput" type="Consumer">
  <t type="String" variance="-"/>
</in>

<!-- Class<?> -->
<in name="unboundedInput" type="Class">
  <t variance="?"/>
</in>
```

### Type Constraints (Bounds)
When defining a `<param>`, use `<extends>` and `<super>` to bound the generic variable.

```xml
<!-- <T Comparable<T extends>> -->
<param name="T">
  <extends type="Comparable">
    <t type="T"/>
  </extends>
</param>
```

---

## 5. Modeling Complex Java Scenarios

### A. Varargs (`List.of(...)`)
Java varargs (e.g., `E... elements`) are marked with the `vararg="true"` boolean attribute on the `<in>` port.

```xml
<block id="b_list_of" name="List.of" ns="java.util">
  <param name="E"/>
  
  <factory id="List#of">
    <t type="E"/>
  </factory>

  <!-- Accepts E... -->
  <in name="elements" type="E" vararg="true"/>
  
  <out name="resultList" type="List">
    <t type="E"/>
  </out>
</block>
```

### B. Recursive Generics (`Enum.valueOf`)
For complex recursive generics like `Enum.valueOf(Class<T> enumType, String name)` where `<T extends Enum<T>>`.

```xml
<block id="b_enum_valueof" name="Enum.valueOf" ns="java.lang">
  <!-- T extends Enum<T> -->
  <param name="T">
    <extends type="Enum">
      <t type="T"/>
    </extends>
  </param>
  
  <factory id="Enum#valueOf">
    <t type="T"/>
  </factory>

  <in name="enumType" type="Class">
    <t type="T"/>
  </in>
  <in name="name" type="String"/>
  
  <out name="resultEnum" type="T"/>
</block>
```

### C. Unions and Intersections
Use `<union>` and `<intersection>` blocks as structural containers. They can replace standard `<t>` elements anywhere in the AST.

```xml
<!-- Union: E.g., Java multi-catch or specialized return types -->
<out name="result">
  <union>
    <t type="String"/>
    <t type="Integer"/>
  </union>
</out>

<!-- Intersection: E.g., (Serializable & Comparable<T>) -->
<in name="complexPayload">
  <intersection>
    <t type="Serializable"/>
    <t type="Comparable">
      <t type="T"/>
    </t>
  </intersection>
</in>
```

### D. The Self Type (Builder Patterns)
Use the empty `<self/>` tag to represent the contextual type instance (e.g., `this` in a fluent builder method).

```xml
<!-- public Builder path(String segment) { ... return this; } -->
<block id="b_path" name="path" ns="java.net.http.HttpRequest.Builder">
  <factory id="HttpRequest.Builder#path"/>
  <in name="segment" type="String"/>
  
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
  <!-- Block-level metadata -->
  <attribute name="description">Executes HTTP GET</attribute>
  
  <in name="url" type="String">
    <!-- Port-level metadata -->
    <attribute name="tooltip">Must be an absolute URL</attribute>
  </in>
</block>
```