# XML Schema Definition (XSD) Guide: Connected Block Diagrams

**Purpose:** This document specifies the schema architecture for instantiated block diagrams (`diagram.xsd` / `diagram.xml`). It models canvas block placements, configured constant parameter values, inter-block wire connections, and lifecycle timestamps.

---

## 1. Common Entity Attributes
All primary diagram entities (`<diagram>`, `<block>`, `<connector>`, `<input>`, `<output>`, and parameter value entries) adhere to a unified base attribute set:

| Attribute | Type | Obligatory? | Description |
| :--- | :--- | :--- | :--- |
| `id` | `xs:ID` | **Yes** | Unique entity identifier across the XML document |
| `createdAt` | `xs:dateTime` | **Yes** | Entity creation timestamp (ISO 8601) |
| `updatedAt` | `xs:dateTime` | **Yes** | Entity last modification timestamp (ISO 8601) |
| `name` | `xs:string` | No | Optional human-readable display name |
| `description` | `xs:string` | No | Optional descriptive text or purpose documentation |

---

## 2. Catalog Selection
The diagram names the block catalogs it uses under `<catalogs>`. Each `<catalog>` is a file name only (no directories or URIs). The catalog display name comes from that file's `<blocks name="...">` attribute, not from the diagram. A diagram with no `<catalogs>` has no catalogs.

```xml
<catalogs>
    <catalog>types.xml</catalog>
    <catalog>control-systems.xml</catalog>
</catalogs>
```

---

## 3. Diagram Canvas & Block Instances
The `<diagram>` element is the root. It contains an optional collection of `<catalogs>`, `<blocks>`, and `<connectors>`.

### Block Coordinates & Catalog Binding
* Block coordinates (`x`, `y`) are strictly defined on the `<block>` element. Connectors do not define layout coordinates.
* `type`: References the catalog block definition `id` from an associated catalog file listed under `<catalogs>`.
* `width` / `height`: Optional canvas rendering dimensions.

```xml
<block id="blk_scaler_01"
       type="scaler"
       name="Main Scaler"
       description="Scales raw channel data"
       x="460.0"
       y="120.0"
       width="240.0"
       height="180.0"
       createdAt="2026-08-31T05:01:00Z"
       updatedAt="2026-08-31T05:20:00Z">
    <attribute name="stage">primary</attribute>
    <!-- Block parameter values go here -->
</block>
```

---

## 4. Concrete Parameter Value Assignments
Inside `<block>`, concrete values for the parameters defined in the catalog are specified under the `<parameters>` element. Each value assignment carries the obligatory lifecycle attributes (`id`, `createdAt`, `updatedAt`) and its assigned `value`.

| Concrete Parameter Tag | Value Type | Valid Example |
| :--- | :--- | :--- |
| `<integer-parameter>` | `xs:integer` | `value="4096"` |
| `<count-parameter>` | `xs:integer` | `value="5"` |
| `<decimal-parameter>` | `xs:decimal` | `value="0.0025"` |
| `<duration-parameter>` | Duration regex (`ns`, `ms`, `s`, `m`, `h`, `d`) | `value="100ms"` |
| `<date-parameter>` | `xs:date` (`yyyy-MM-dd`) | `value="2026-08-31"` |
| `<time-parameter>` | `xs:time` (`hh:mm:ss`) | `value="08:00:00"` |
| `<date-time-parameter>` | `xs:dateTime` (`yyyy-MM-dd'T'hh:mm:ss`) | `value="2026-08-31T08:00:00"` |
| `<integer-range-parameter>` | `xs:integer` | `value="75"` |
| `<double-range-parameter>` | `xs:double` | `value="2.25"` |
| `<text-parameter>` | `xs:string` | `value="telemetry/engine/temp"` |

### Example Parameter Block

```xml
<parameters>
    <decimal-parameter id="p_val_01"
                       name="calibrationOffset"
                       value="0.0042"
                       createdAt="2026-08-31T05:01:00Z"
                       updatedAt="2026-08-31T05:18:00Z"/>

    <integer-range-parameter id="p_val_02"
                             name="smoothingWindow"
                             value="75"
                             createdAt="2026-08-31T05:01:00Z"
                             updatedAt="2026-08-31T05:19:00Z"/>

    <duration-parameter id="p_val_03"
                        name="sampleInterval"
                        value="50ms"
                        createdAt="2026-08-31T05:01:00Z"
                        updatedAt="2026-08-31T05:20:00Z"/>
</parameters>
```

---

## 5. Connectors & Endpoints
Connectors wire an output port of a source block to an input port of a destination block.

### Endpoint Structure (`<input>` and `<output>`)
* `block`: Target block `id` (required).
* `port`: Target port name (optional).
* `index`: Multi-channel or array index (optional integer, defaults to `0`).
* Endpoints are full entities containing obligatory `id`, `createdAt`, and `updatedAt` attributes.

### Connector Wiring Example

```xml
<connector id="conn_01"
           name="SensorToScalerLink"
           description="Feeds telemetry channel 0 to the primary scaler"
           createdAt="2026-08-31T05:10:00Z"
           updatedAt="2026-08-31T05:25:00Z">

    <attribute name="lineStyle">solid</attribute>
    <attribute name="color">#007ACC</attribute>

    <!-- Source block endpoint -->
    <input id="ep_in_01"
           name="SourceOutPort"
           block="blk_sensor_in"
           port="data_out"
           index="0"
           createdAt="2026-08-31T05:10:00Z"
           updatedAt="2026-08-31T05:10:00Z">
        <attribute name="dataType">f64</attribute>
    </input>

    <!-- Destination block endpoint -->
    <output id="ep_out_01"
            name="ScalerInPort"
            block="blk_scaler_01"
            port="raw_in"
            index="0"
            createdAt="2026-08-31T05:10:00Z"
            updatedAt="2026-08-31T05:10:00Z">
        <attribute name="buffered">true</attribute>
    </output>
</connector>
```

---

## 6. Custom Extensibility
Custom `<attribute name="...">value</attribute>` elements can be declared within `<diagram>`, `<block>`, `<parameters>`, `<connector>`, and connector `<input>`/`<output>` endpoints to attach arbitrary application-specific metadata.