# Bld

A client-side [Lit](https://lit.dev/) app. The workspace is custom elements: a menubar, a left palette of block icons, and a `bld-diagram` canvas that owns pan, zoom, drop, and wiring. Nodes (`bld-node`) and connectors (`bld-connector`) are also custom elements with shadow trees; nodes size themselves with flex, and connectors are SVG cubic paths that follow each node's measured ports.

Diagrams load multiple XML type/block models (`src/resources/models/*.xml`, described by `src/resources/blocks.xsd` and `src/resources/blocks.md`). Wiring an output into an input grounds that input and infers the block's generic types.

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

Then open [http://localhost:8080](http://localhost:8080). Vite rebuilds and live-reloads when you change TypeScript or CSS.

Release assets go to `dist/`:

```bash
make build
```

Serve that folder with any static file server.

## Using the canvas

- Drag a block icon from the left pane onto the canvas (or double-click a palette item to drop it in the center).
- Click or drag from an output handle to an input handle to ground a type. Inferred parameters and port types update on the block.
- Control Systems (`cs`): wire Timer → Quantizer → Sin → Oscilloscope. The graph is the Java expression `oscilloscope(sin(quantizer(timer())))`, with nested `Consumer` types (Timer returns `Consumer<Consumer<Consumer<Double>>>`). Click Chart on Oscilloscope for a live Chart.js plot.
- Scroll to zoom toward the cursor. Use the zoom controls in the lower-right, or **View** in the menu.
- Drag empty canvas space to pan. Drag a placed block to move it.
- **Delete** / **Backspace** removes the selected block or edge. **Ctrl/Cmd+0** resets the view.

## Stack

- [Lit](https://lit.dev/) custom elements (CSR)
- [Chart.js](https://www.chartjs.org/) for the oscilloscope (dark mode)
- Vite
- TypeScript 7
- Bootstrap 5.3.8, dark theme (`data-bs-theme="dark"`)
