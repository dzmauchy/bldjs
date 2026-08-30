# Bld

A client-side [Lit](https://lit.dev/) app. The workspace is custom elements: a toolbar (Run / Stop, plus a three-line menu), a left palette of block icons, and a `bld-diagram` canvas that owns pan, zoom, drop, and wiring. Nodes (`bld-node`) and connectors (`bld-connector`) are also custom elements with shadow trees; nodes size themselves with flex, and connectors are JointJS [`jumpover`](https://docs.jointjs.com/api/connectors/#jumpover) paths (`size: 10`, `radius: 10`, `jump: 'arc'`) routed around other nodes by [`initAvoidRouter({ worker: true })`](https://docs.jointjs.com/api/avoid-router/initAvoidRouter/).

Diagrams load multiple XML type/block models (`src/resources/models/*.xml`, described by `src/resources/models/blocks.xsd` and `src/resources/models/blocks.md`). Wiring an output into an input grounds that input and infers the block's generic types. The builtin type library (`types.xml`) is language-agnostic: `f64`, `f32`, `i32`, `i64`, `str`, `bool`, consumers `c1`/`c2`, supplier `s`, functions `f1`/`f2`, and arrays `T[]`. The WASM runtime maps those onto WASM valtypes (`bool` → `i32`, `str` → js-string / `externref`).

This is a TypeScript port of the Rust/Leptos [bld](https://github.com/dzmauchy/bld) workspace.

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
```

so generated WASM can instantiate without `unsafe-eval`, and `SharedArrayBuffer` / `Atomics.wait` are available (`crossOriginIsolated`).

Release assets go to `dist/`:

```bash
make build
```

`make check` / `npm run check` typechecks the app and validates every `src/resources/models/*.xml` catalog against `blocks.xsd`.

Serve that folder with any static file server that sets the same CSP and isolation headers.

## Using the canvas

- Drag a block icon from the left pane onto the canvas (or double-click a palette item to drop it in the center).
- Click or drag from an output handle to an input handle to ground a type. Port types appear as hints on hover or click, not as permanent labels on the block.
- Control Systems (`com.dauch.cs`): wire Oscilloscope (`com.dauch.cs.sink`) → Quantizer (`com.dauch.cs`) → Sin or Cos (`com.dauch.cs.transform`) → Timer (`com.dauch.cs.gen`). Every port is `c<f64>` (`DoubleConsumer`). Composition is `timer(sin(quantizer(plot)))`. The WASM backend still lowers each sample to first-order `f64`.
- **Run** runs each block's [binaryen.js](https://github.com/AssemblyScript/binaryen.js) script from `src/resources/binaryen/blocks` into one module, emits wasm-gc (typed `call_ref`), starts one worker per generator, and parks with `memory.atomic.wait32` on a shared sample buffer. After Run, click Chart on Oscilloscope; the chart reads that buffer.
- Scroll to zoom toward the cursor. Use the zoom controls in the lower-right, or **View** in the three-line menu.
- Drag empty canvas space to pan. Drag a placed block to move it.
- **Delete** / **Backspace** removes the selected block or edge. **Ctrl/Cmd+0** resets the view.

## Stack

- [Lit](https://lit.dev/) custom elements (CSR)
- [JointJS avoid router](https://docs.jointjs.com/api/avoid-router/initAvoidRouter/) (`initAvoidRouter` in a Worker) plus the [`jumpover`](https://docs.jointjs.com/api/connectors/#jumpover) connector (`size: 10`, `radius: 10`, `jump: 'arc'`)
- [Chart.js](https://www.chartjs.org/) for the oscilloscope (dark mode)
- [binaryen.js](https://www.npmjs.com/package/binaryen) generates wasm-gc (`call_ref`) and `memory.atomic.wait32` on a SharedArrayBuffer
- Vite
- TypeScript 7
- Bootstrap 5.3.8, dark theme (`data-bs-theme="dark"`)
