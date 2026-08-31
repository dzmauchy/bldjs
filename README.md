# Bld

A client-side [Lit](https://lit.dev/) app. The workspace is custom elements: a toolbar (Run / Stop, plus a three-line menu), a left palette of block icons, and a `bld-diagram` canvas that owns pan, zoom, drop, and wiring. Nodes (`bld-node`) and connectors (`bld-connector`) are also custom elements with shadow trees; nodes size themselves with flex, and connectors are JointJS [`jumpover`](https://docs.jointjs.com/api/connectors/#jumpover) paths (`size: 5`, `radius: 5`, `jump: 'cubic'`) drawn as CSS `clip-path` polygons, routed around other nodes by [`initAvoidRouter({ worker: true })`](https://docs.jointjs.com/api/avoid-router/initAvoidRouter/).

Diagrams load multiple XML type/block models (`packages/xml/src/resources/models/*.xml`, described by `packages/xml/src/resources/models/blocks.xsd` and `packages/xml/src/resources/models/blocks.md`). Wiring an output into an input grounds that input and infers the block's generic types. The builtin type library (`types.xml`) is language-agnostic: `f64`, `f32`, `i32`, `i64`, `str`, `bool`, consumers `c1`/`c2`, supplier `s`, functions `f1`/`f2`, and arrays `T[]`. The WASM runtime maps those onto WASM valtypes (`bool` → `i32`, `str` → js-string / `externref`).

This is a TypeScript port of the Rust/Leptos [bld](https://github.com/dzmauchy/bld) workspace. The repo is an npm workspaces monorepo:

```
packages/
  xml/   XML model, type inference, save/open, import/export, CS blocks, runner abstraction
  wasm/  WASM block implementations and WASM runner
  ui/    Lit workspace UI
```

## Prerequisites

- Node.js 22+

```bash
npm install
```

## Run in the browser

From the project root:

```bash
npm run dev
```

Or:

```bash
make serve
```

Then open [http://localhost:8080](http://localhost:8080). Vite rebuilds and live-reloads when you change TypeScript or CSS. The server sends

```
Content-Security-Policy: script-src 'self' 'wasm-unsafe-eval';
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

so generated WASM can instantiate without `unsafe-eval`, and `SharedArrayBuffer` is available (`crossOriginIsolated`) for generator worker threads.

Those headers only isolate a **secure context** (HTTPS or `localhost`). Opening `http://192.168.x.x:8080` from a phone is not secure, so `crossOriginIsolated` stays false. The app then runs the avoid router and generator on the main thread instead of failing to start a worker. `make build` also writes `dist/_headers` (Netlify / Cloudflare Pages) with the same values.

Release assets go to `dist/`:

```bash
make build
```

`make check` / `npm run check` typechecks the app, validates catalog XML (`types.xml`, `control-systems.xml`, `blocks.xml`) against `blocks.xsd`, and validates `diagram.xml` against `diagram.xsd`.

Serve that folder with any static file server that sets the same CSP and isolation headers.

## Using the canvas

- Drag a block icon from the left pane onto the canvas (or double-click a palette item to drop it in the center). On a phone, tap **Blocks** to open the overlay, then drag (or tap) a block onto the canvas.
- Click or drag from an output handle to an input handle to ground a type. While a wire is in progress, the source output and every compatible input show their type under the port; the labels disappear once the wire is finished or cancelled. On a phone, dropping the wire on a block is enough when that block has only one compatible input.
- Phones keep a compact overlay (portrait and landscape): smaller chrome and blocks, a scrollable block list, and canvas pan from a finger drag. The page stays at `initial-scale=1` so the browser does not steal those gestures.
- Control Systems (`com.dauch.cs`): wire Scope (`com.dauch.cs.sink`) → Quantizer (`com.dauch.cs`) → Sin or Cos (`com.dauch.cs.transform`) → Timer (`com.dauch.cs.gen`). Timer, Sin, Cos, and Quantizer ports are `c<f64>` (`DoubleConsumer`). Scope returns a dynamically sized vector `c<f64>[]`; each outgoing wire is one plot channel: `timer(fork(sin(plot[0]), cos(plot[1])))`. Several `c<f64>` outputs may share one input; Run inserts a hidden `fork` that forwards each sample to every downstream. Binaryen builder blocks use the same `<in>` / `<out>` ports as the XML catalog, plus a runtime `$ctx` pointer.
- **Run** serializes the canvas to diagram XML (`diagram.xsd`), infers types from that XML and the block catalog, then asks SolutionBuilder to assemble wasm: one [binaryen.js](https://github.com/AssemblyScript/binaryen.js) function per XML block from `packages/wasm/src/binaryen/blocks`, connectors to wire them (GC array slots and `fork` on fan-in). Consumers are typed funcrefs (`(ref $c1_f64)`). It starts one worker thread per generator (Timer). That worker drives `tick` with `setInterval` (quantizer delay, default 10 ms) and writes samples into a shared buffer. The runner intercepts `c<?>` connector frequency after each tick; live wires set `animation-duration` from that Hertz (`1000 / hz`, clamped to 200–2500 ms) via inline style. After Run, click Chart on Scope; the plot is a canvas multi-axis line with one series / y-axis per vector channel.
- **File** in the three-line menu: **Save…** / **Open…** store named diagrams in IndexedDB (manual only). **Import XML…** / **Export XML** read and write `diagram.xsd` files. **Catalogs** lists associated block catalogs by their XML `blocks.name` and can be toggled for the current diagram; the diagram XML records those catalogs as file names under `<catalogs>`.
- Scroll to zoom toward the cursor. Use the zoom controls in the lower-right, or **View** in the three-line menu.
- Drag empty canvas space to pan. Drag a placed block to move it (touch and mouse; the canvas captures the pointer so a phone can drag).
- **Delete** / **Backspace** removes the selected block or edge. **Ctrl/Cmd+0** resets the view.

## Stack

- [Lit](https://lit.dev/) custom elements (CSR)
- [JointJS avoid router](https://docs.jointjs.com/api/avoid-router/initAvoidRouter/) (`initAvoidRouter` in a Worker) plus the [`jumpover`](https://docs.jointjs.com/api/connectors/#jumpover) connector (`size: 5`, `radius: 5`, `jump: 'cubic'`) as CSS `clip-path` polygons
- Canvas 2d for the scope (dark mode, multi-axis line)
- [binaryen.js](https://github.com/AssemblyScript/binaryen.js) emits wasm from XML-matching block functions (`(ref $c1_f64)` consumers, GC arrays); each generator worker ticks with `setInterval` and writes a SharedArrayBuffer
- Vite
- TypeScript 7
- Bootstrap 5.3.8, dark theme (`data-bs-theme="dark"`)
