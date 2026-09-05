# XML Schema Definition (XSD) Guide: Types, Blocks, and Parameters

**Purpose:** This document provides specification rules, constraints, and structural examples for generating and parsing block catalogs (`blocks.xsd` / `blocks.xml`). It models MoonBit types, functional execution nodes (blocks), and configurable constant parameters.

---

## 1. Document Root & Namespaces
The root element is `<blocks>`. It acts as the catalog container for `<namespace>`, `<type>`, and `<block>` definitions. Catalog identity is `blocks.id` and `blocks.name`. Catalog XML files declare `blocks.xsd` with `xsi:noNamespaceSchemaLocation`.

```xml
<blocks id="dsp_catalog" name="Signal Processing Catalog" icon="workspace.png"
        xmlns:xsi="[http://www.w3.org/2001/XMLSchema-instance](http://www.w3.org/2001/XMLSchema-instance)"
        xsi:noNamespaceSchemaLocation="blocks.xsd">
  <namespace id="com.dsp" name="DSP"/>
  <namespace id="com.dsp.transform" name="Transforms" parent="com.dsp"/>
  
  <!-- Types and Blocks go here -->
</blocks>
```

---

## 2. Modeling Types
Port and parameter types are MoonBit type strings on the `type` attribute. Nested type trees are not used.

```xml
<type name="Array">
  <param name="T"/>
</type>
```

Examples:

* `Double`, `Float`, `Int`, `Int64`, `String`, `Bool`, `Unit`
* `Array[T]`
* `(Double) -> Unit`
* `(T1, T2) -> R`
* `() -> Double`
* `_` (type hole)
* `Self`

---

## 3. Modeling Blocks & Ports
A `<block>` represents an executable node definition in the catalog.

### Essential Block Attributes
* `id`: Unique identifier within the catalog.
* `name`: Human-readable block name.
* `ns`: Namespace ID.
* `icon`: (Optional) Visual identifier icon.

### Factory Binding
* `<factory id="...">`: Binds the block to an executable operation. Factory IDs are scoped relative to the block's `ns`.

### Ports (`<in>`, `<out>`, `<input>`, and `<output>`)
* `name`: Port name (required).
* `type`: MoonBit type string (e.g. `Double`, `(Double) -> Unit`, `Array[T]`).
* `direction`: Optional explicit port direction (`in` | `out`).
* `vararg`: Boolean flag for variable arguments (default `false`).
* `relation`: Optional relation kind (`intersection` | `union` | `identity` | `map` | `subtype` | `supertype` | `custom`).
* `relatesTo`: Comma-separated list of related port names (e.g. `relatesTo="in1,in2"`).

### Relations Between Input Types and Output Types (`<relation>` / `<type-relation>`)
Blocks can declare explicit relations between input and output ports:
* `kind`: `intersection` (default), `union`, `identity`, `map`, etc.
* `from` / `input`: Input ports contributing to the relation.
* `to` / `output`: Output port receiving the inferred type.
* Common types across multiple inputs constraining a generic parameter `T` or declared via `<relation kind="intersection">` are inferred as **type intersections** (e.g. `A & B`).

```xml
<block id="combiner" name="Combiner" ns="com.dsp.transform">
  <in name="in1" type="Double"/>
  <in name="in2" type="Int"/>
  <out name="out" type="_"/>
  <relation kind="intersection" from="in1,in2" to="out"/>
</block>
```

---

## 4. Configurable Block Settings & Parameters (`<settings>` / `<parameters>`)
Blocks declare static/configurable constant inputs and settings under `<settings>` or `<parameters>`. In addition to specific parameter types, blocks can use generic `<setting>` elements with explicit types (`type="Int"`, `type="Double"`, `type="String"`).

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
  <factory id="transform#scale"/>

  <settings>
    <!-- Explicit typed settings -->
    <setting name="bufferSize" type="Int" default="1024" min="64" max="65536" step="64"/>
    <setting name="calibrationOffset" type="Double" description="Zero-point baseline shift" default="0.0025"/>

    <!-- Slider with integer step -->
    <integer-range-parameter name="smoothingWindow" description="Window size for moving average" min="10" max="200" step="5" default="50"/>

    <!-- Slider with continuous double range -->
    <double-range-parameter name="gainFactor" description="Gain multiplier" min="0.1" max="5.0" step="0.05" default="1.75"/>

    <!-- Duration constraint -->
    <duration-parameter name="sampleInterval" description="Polling interval" default="100ms"/>

    <!-- Validated Text -->
    <text-parameter name="filterName" minChars="3" maxChars="32" pattern="^[a-zA-Z0-9_-]+$" default="default_filter"/>
  </settings>

  <in name="raw_in" type="(Double) -> Unit"/>
  <out name="scaled_out" type="(Double) -> Unit"/>
</block>
```

---

## 5. Input and Output Type Constants
All constants related to input and output types are defined in `blocks.xsd` as simple types and exported in `@bld/xml` (`ast.ts` and `types.ts`):
* `PRIMITIVE_TYPES`: `Double`, `Float`, `Int`, `Int64`, `UInt`, `UInt64`, `String`, `Bool`, `Byte`, `Char`, `Unit`
* `BUILTIN_CONTAINER_TYPES`: `Array`
* `SPECIAL_TYPES`: `Self`, `_`
* `TYPE_KINDS`: `type`, `func`, `tuple`, `array`, `union`, `intersection`, `hole`, `self`
* `PORT_DIRECTIONS`: `in`, `out`
* `RELATION_KINDS`: `intersection`, `union`, `identity`, `map`, `subtype`, `supertype`, `custom`
* `BLOCK_PARAMETER_KINDS` / `SETTING_KINDS`
* `VARIANCE_TYPES`: `+`, `-`, `=`, `?`

---

## 6. Custom Attributes
Any catalog element (`blocks`, `block`, `type`, `param`, `in`, `out`, `parameters`, `settings`, or parameter definitions) can contain arbitrary `<attribute name="...">value</attribute>` elements for metadata extensions.

