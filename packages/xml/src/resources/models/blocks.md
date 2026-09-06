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

Type variables use `<var>` instead of `<param>`:

```xml
<var>T</var>
<var>F:extends(h(F))</var>
```

The text is a Prolog variable. An optional `:constraint` is a Prolog term (for example F-bounded `extends(h(F))`).

---

## 3. Modeling Blocks & Ports
A `<block>` represents an executable node definition in the catalog. The block `id` links the node to its asm / MoonBit generator. There is no `<factory>` element.

### Essential Block Attributes
* `id`: Unique identifier within the catalog (also the generator id).
* `name`: Human-readable block name.
* `ns`: Namespace ID.
* `icon`: (Optional) Visual identifier icon.

### Type program (`<type>`)
Every block has a Trealla Prolog program that infers types and checks input compatibility. Blocks share the common library in `packages/xml/src/blocks/prolog/types.pl` (`module(type)`). Type variables are attributed variables; unification runs `attr_unify_hook/2` via Trealla's `verify_attributes/3`.

Port temps in the goal are `In_<name>` and `Out_<name>`. Declared `<var>` names are in scope. The default program `true.` is enough when ports share type variables.

After unification, an output that still has free type variables is not connectable.

```xml
<block id="b_apply" name="Apply" ns="types">
  <var>T</var>
  <var>R</var>
  <type>true.</type>
  <in name="fn" type="(T) -> R"/>
  <in name="arg" type="T"/>
  <out name="result" type="R"/>
</block>
```

Extra predicates: `compatible/2`, `unify_type/2`, `constrain/2`, `constrain_join/2`, `meet/3`, `join/3`, `read_type/2`, `connectable/1`.

### Ports (`<in>`, `<out>`, `<input>`, and `<output>`)
* `name`: Port name (required).
* `type`: Type string (e.g. `double`, `(double) -> unit`, `array[T]`).
* `direction`: Optional explicit port direction (`in` | `out`).
* `vararg`: Boolean flag for variable arguments (default `false`).
* `relation`: Optional relation kind (`intersection` | `union` | `identity` | `map` | `subtype` | `supertype` | `custom`).
* `relatesTo`: Comma-separated list of related port names (e.g. `relatesTo="in1,in2"`).

### Relations Between Input Types and Output Types (`<relation>` / `<type-relation>`)
XML relations remain catalog metadata. Inference and compatibility are the Prolog `<type>` program. Common types across multiple inputs constraining a generic `T` are inferred as **type intersections** (`A & B`). Vararg groundings join (`A | B`) unless the type program says otherwise.

```xml
<block id="combiner" name="Combiner" ns="com.dsp.transform">
  <type>meet(In_in1, In_in2, Out_out).</type>
  <in name="in1" type="double"/>
  <in name="in2" type="int"/>
  <out name="out" type="_"/>
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
  <type>true.</type>

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
