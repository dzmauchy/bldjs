# XML Schema Definition (XSD) Guide: Types, Blocks, and Parameters

**Purpose:** This document provides specification rules, constraints, and structural examples for generating and parsing block catalogs (`blocks.xsd` / `blocks.xml`). It models language-agnostic data types, generic type expressions (AST), functional execution nodes (blocks), and configurable constant parameters.

---

## 1. Document Root & Namespaces
The root element is `<blocks>`. It acts as the catalog container for `<library>`, `<namespace>`, `<type>`, and `<block>` definitions. Catalog XML files declare `blocks.xsd` with `xsi:noNamespaceSchemaLocation`.

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

## 2. Modeling Types & Generic AST
The schema represents type constructs through a recursive Abstract Syntax Tree (AST). Base type expressions (`t`, `in`, `out`, `extends`, `super`, `ancestor`) can nest arbitrarily.

### Variance & Generics
* **Covariant (`+`):** `? extends T`
* **Contravariant (`-`):** `? super T`
* **Unbounded (`?`):** `?` (omits `type`)
* **Param Constraints:** `<param name="T"><extends type="..."/></param>`

```xml
<type name="c1" ns="com.dsp">
  <attribute name="wasm">(func (param T))</attribute>
  <param name="T"/>
</type>

<type name="[]" ns="com.dsp">
  <attribute name="wasm">array</attribute>
  <param name="T"/>
</type>
```

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

### Ports (`<in>` and `<out>`)
* `name`: Port name (required).
* `type`: Type name reference (e.g., `c1`, `[]`, `f64`).
* `vararg`: Boolean flag for variable arguments (default `false`).

---

## 4. Configurable Block Parameters (`<parameters>`)
Blocks declare static/configurable constant inputs under the `<parameters>` container. These definitions dictate UI control rendering, defaults, constraints, and validation rules.

| Parameter Tag | UI / Target Control | Key Constraint Attributes | Supported Units / Patterns |
| :--- | :--- | :--- | :--- |
| `<integer-parameter>` | Number Input | `default` | Standard 64-bit integer |
| `<count-parameter>` | Spinner (Up/Down) | `min`, `max`, `step`, `default` | Integer stepping (`min` defaults to 0) |
| `<decimal-parameter>` | Floating-point Input | `default` | Fixed-point / Decimal notation |
| `<duration-parameter>` | Time Duration Picker | `default` | Regex pattern: `[0-9]+(\.[0-9]+)?(ns\|us\|µs\|ms\|s\|m\|h\|d)` |
| `<date-parameter>` | Calendar Picker | `default` | ISO 8601 Date (`yyyy-MM-dd`) |
| `<time-parameter>` | Time Clock Picker | `default` | ISO 8601 Time (`hh:mm:ss`) |
| `<date-time-parameter>`| Timestamp Picker | `default` | ISO 8601 Combined (`yyyy-MM-dd'T'hh:mm:ss`) |
| `<integer-range-parameter>` | Integer Slider / Range | `min`, `max`, `step`, `default` | `min` and `max` required |
| `<double-range-parameter>` | Float Slider / Range | `min`, `max`, `step`, `default` | `min` and `max` required |
| `<text-parameter>` | Text Field / Area | `minChars`, `maxChars`, `pattern`, `default` | Regex pattern and string length bounds |

### Block Parameter Catalog Example

```xml
<block id="scaler" name="Signal Scaler" ns="com.dsp.transform" icon="scaler.svg">
  <factory id="transform#scale"/>

  <parameters>
    <!-- Floating point calibration offset -->
    <decimal-parameter name="calibrationOffset" description="Zero-point baseline shift" default="0.0025"/>

    <!-- Slider with integer step -->
    <integer-range-parameter name="smoothingWindow" description="Window size for moving average" min="10" max="200" step="5" default="50"/>

    <!-- Slider with continuous double range -->
    <double-range-parameter name="gainFactor" description="Gain multiplier" min="0.1" max="5.0" step="0.05" default="1.75"/>

    <!-- Duration constraint -->
    <duration-parameter name="sampleInterval" description="Polling interval" default="100ms"/>

    <!-- Validated Text -->
    <text-parameter name="filterName" minChars="3" maxChars="32" pattern="^[a-zA-Z0-9_-]+$" default="default_filter"/>
  </parameters>

  <in name="raw_in" type="c1">
    <t type="f64"/>
  </in>
  <out name="scaled_out" type="c1">
    <t type="f64"/>
  </out>
</block>
```

---

## 5. Custom Attributes
Any catalog element (`blocks`, `block`, `type`, `param`, `in`, `out`, `parameters`, or parameter definitions) can contain arbitrary `<attribute name="...">value</attribute>` elements for metadata extensions.