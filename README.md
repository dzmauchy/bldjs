# Bld

A client-side [Lit](https://lit.dev/) app. The workspace is custom elements: a toolbar (Run / Stop, plus a three-line menu), a left palette of block icons, and a `bld-diagram` canvas that owns pan, zoom, drop, and wiring. Nodes (`bld-node`) and connectors (`bld-connector`) are also custom elements with shadow trees; nodes size themselves with flex, and connectors are SVG cubic paths that follow each node's measured ports.

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
- Click or drag from an output handle to an input handle to ground a type. Inferred parameters and port types update on the block.
- Control Systems (`cs`): wire Timer → Quantizer → Sin → Oscilloscope. Ports are `f64`; the WASM backend treats those blocks as `s<f64>`, `f1<f64, f64>`, and `c1<f64>`, composed as `oscilloscope(sin(quantizer(timer())))`.
- **Run** assembles those block WAT files into one module, compiles it to wasm-gc (typed `call_ref`), starts one worker per generator, and parks with `memory.atomic.wait32` on a shared sample buffer. After Run, click Chart on Oscilloscope; the chart reads that buffer.
- Scroll to zoom toward the cursor. Use the zoom controls in the lower-right, or **View** in the three-line menu.
- Drag empty canvas space to pan. Drag a placed block to move it.
- **Delete** / **Backspace** removes the selected block or edge. **Ctrl/Cmd+0** resets the view.

## Stack

- [Lit](https://lit.dev/) custom elements (CSR)
- [Chart.js](https://www.chartjs.org/) for the oscilloscope (dark mode)
- wasm-gc typed functions (`call_ref`) and `memory.atomic.wait32` on a SharedArrayBuffer
- Vite
- TypeScript 7
- Bootstrap 5.3.8, dark theme (`data-bs-theme="dark"`)
