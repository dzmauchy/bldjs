# XML Schema Definition (XSD) Guide: Types, Blocks, and Parameters

**Purpose:** This document provides specification rules, constraints, and structural examples for generating and parsing block catalogs (`blocks.xsd` / `blocks.xml`). It models types, functional execution nodes (blocks), and configurable constant parameters.

---

## 1. Document Root & Namespaces
The root element is `<blocks>`. It acts as the catalog container for `<namespace>`, `<type>`, and `<block>` definitions. Catalog identity is `blocks.id` and `blocks.name`. Catalog XML files declare `blocks.xsd` with `xsi:noNamespaceSchemaLocation`.

```xml
<blocks id="dsp_catalog" name="Signal Processing Catalog" icon="workspace.png"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="blocks.xsd">
  <namespace id="com.dsp" name="DSP"/>
  <namespace id="com.dsp.transform" name="Transforms" parent="com.dsp"/>
  
  <!-- Types and Blocks go here -->
</blocks>
```

---

## 2. Modeling Types
Raw type names are camelCase (they start with a lowercase letter). Port and parameter types are type strings on the `type` attribute. Nested type trees are not used.

```xml
<type name="array">
  <var>T</var>
</type>
```

Examples:

* `double`, `float`, `int`, `int64`, `string`, `bool`, `unit`
* `array[T]`
* `(double) -> unit`
* `(T1, T2) -> R`
* `() -> double`
* `_` (type hole)
* `self`

Type variables use `<var>` instead of `<param>`. Constraints also attach to port `type` strings:

```xml
<var>T</var>
<var>F:extends(h(F))</var>
<in name="in" type="T:extends(h(T))"/>
<out name="out" type="comparable(?(super(T)))"/>
```

The text before `:` is a Prolog variable or MoonBit type. An optional `:constraint` is a Prolog term (`extends(h(F))`, `comparable(?(super(T)))`). A bare constraint with no MoonBit type is allowed.

---

## 3. Modeling Blocks & Ports
A `<block>` represents an executable node definition in the catalog. The block `id` links the node to its asm / MoonBit generator. There is no `<factory>` element and no per-block `<type>` program.

* `id`: Unique identifier within the catalog (also the generator id).
* `name`: Human-readable block name.
* `ns`: Namespace ID.
* `icon`: (Optional) Visual identifier icon.

Inference loads two Prolog files into Trealla (WASM), in order:

1. `packages/xml/src/blocks/prolog/types.pl` — `library(atts)`, `attr_unify_hook/2` via `verify_attributes/3`, `infer_spec/5`, `extends/1`, `comparable/1`, `super/1`, `?/1`.
2. `packages/xml/src/blocks/prolog/blocks.pl` — `infer_block(Id, Grounded, Result)` using `block(Id, Vars, Ins, Outs)` facts generated from the catalog by id.

A block declares only type variables, inputs, and outputs (plus optional settings). After unification, an output that still has free type variables is not connectable.

```xml
<block id="b_apply" name="Apply" ns="types">
  <var>T</var>
  <var>R</var>
  <in name="fn" type="(T) -> R"/>
  <in name="arg" type="T"/>
  <out name="result" type="R"/>
</block>
```

Shared type variables across inputs meet (`A & B`). Vararg groundings join (`A | B`).

### Ports (`<in>`, `<out>`, `<input>`, and `<output>`)
* `name`: Port name (required).
* `type`: Type string (e.g. `double`, `(double) -> unit`, `array[T]`, `T:extends(h(T))`, `comparable(?(super(T)))`).
* `direction`: Optional explicit port direction (`in` | `out`).
* `vararg`: Boolean flag for variable arguments (default `false`).
* `relation`: Optional relation kind (`intersection` | `union` | `identity` | `map` | `subtype` | `supertype` | `custom`).
* `relatesTo`: Comma-separated list of related port names (e.g. `relatesTo="in1,in2"`).

### Relations Between Input Types and Output Types (`<relation>` / `<type-relation>`)
XML relations remain catalog metadata. Inference uses `blocks.pl` rules keyed by block id together with declared vars, port types, and constraints. Common types across multiple inputs constraining a generic `T` are inferred as **type intersections** (`A & B`). Vararg groundings join (`A | B`).

```xml
<block id="combiner" name="Combiner" ns="com.dsp.transform">
  <var>T</var>
  <in name="in1" type="T"/>
  <in name="in2" type="T"/>
  <out name="out" type="T"/>
</block>
```

---

## 4. Configurable Block Settings & Parameters (`<settings>` / `<parameters>`)
Blocks declare static/configurable constant inputs and settings under `<settings>` or `<parameters>`. In addition to specific parameter types, blocks can use generic `<setting>` elements with explicit types (`type="int"`, `type="double"`, `type="string"`).

| Parameter / Setting Tag | UI / Target Control | Key Constraint Attributes | Supported Units / Patterns |
| :--- | :--- | :--- | :--- |
| `<setting>` | Typed Setting Control | `type`, `default`, `min`, `max`, `step` | General typed block configuration |
| `<integer-parameter>` | Number Input | `type`, `default` | Standard 64-bit integer |
| `<count-parameter>` | Spinner (Up/Down) | `min`, `max`, `step`, `default` | Integer stepping (`min` defaults to 0) |
| `<decimal-parameter>` | Floating-point Input | `default` | Fixed-point / Decimal notation |
| `<duration-parameter>` | Time Duration Picker | `default` | Regex pattern: `[0-9]+(\.[0-9]+)?(ns\|us\|µs\|ms\|s\|m\|h\|d)` |
| `<date-parameter>` | Calendar Picker | `default` | ISO 8601 Date (`yyyy-MM-dd`) |
| `<time-parameter>` | Time Clock Picker | `default` | ISO 8601 Time (`hh:mm:ss`) |
| `<date-time-parameter>`| Timestamp Picker | `default` | ISO 8601 Combined (`yyyy-MM-dd'T'hh:mm:ss`) |
| `<integer-range-parameter>` | Integer Slider / Range | `min`, `max`, `step`, `default` | `min` and `max` required |
| `<double-range-parameter>` | Float Slider / Range | `min`, `max`, `step`, `default` | `min` and `max` required |
| `<text-parameter>` | Text Field / Area | `minChars`, `maxChars`, `pattern`, `default` | Regex pattern and string length bounds |

### Block Settings & Parameter Catalog Example

```xml
<block id="scaler" name="Signal Scaler" ns="com.dsp.transform" icon="scaler.svg">
  <settings>
    <!-- Explicit typed settings -->
    <setting name="bufferSize" type="int" default="1024" min="64" max="65536" step="64"/>
    <setting name="calibrationOffset" type="double" description="Zero-point baseline shift" default="0.0025"/>

    <!-- Slider with integer step -->
    <integer-range-parameter name="smoothingWindow" description="Window size for moving average" min="10" max="200" step="5" default="50"/>

    <!-- Slider with continuous double range -->
    <double-range-parameter name="gainFactor" description="Gain multiplier" min="0.1" max="5.0" step="0.05" default="1.75"/>

    <!-- Duration constraint -->
    <duration-parameter name="sampleInterval" description="Polling interval" default="100ms"/>

    <!-- Validated Text -->
    <text-parameter name="filterName" minChars="3" maxChars="32" pattern="^[a-zA-Z0-9_-]+$" default="default_filter"/>
  </settings>

  <in name="raw_in" type="(double) -> unit"/>
  <out name="scaled_out" type="(double) -> unit"/>
</block>
```

---

## 5. Input and Output Type Constants
All constants related to input and output types are defined in `blocks.xsd` as simple types and exported in `@bld/xml` (`ast.ts` and `types.ts`):
* `PRIMITIVE_TYPES`: `double`, `float`, `int`, `int64`, `uint`, `uint64`, `string`, `bool`, `byte`, `char`, `unit`
* `BUILTIN_CONTAINER_TYPES`: `array`
* `SPECIAL_TYPES`: `self`, `_`
* `TYPE_KINDS`: `type`, `func`, `tuple`, `array`, `union`, `intersection`, `hole`, `self`
* `PORT_DIRECTIONS`: `in`, `out`
* `RELATION_KINDS`: `intersection`, `union`, `identity`, `map`, `subtype`, `supertype`, `custom`
* `BLOCK_PARAMETER_KINDS` / `SETTING_KINDS`
* `VARIANCE_TYPES`: `+`, `-`, `=`, `?`

---

## 6. Custom Attributes
Any catalog element (`blocks`, `block`, `type`, `var`, `in`, `out`, `parameters`, `settings`, or parameter definitions) can contain arbitrary `<attribute name="...">value</attribute>` elements for metadata extensions.
