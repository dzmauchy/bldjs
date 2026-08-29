# Bld

A client-side [Svelte](https://svelte.dev/) app. The workspace is a menubar, a left palette of block icons, and a diagram canvas built from custom elements: `bld-node` (flex layout in a shadow tree) and `bld-connector` (SVG cubic paths).

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

Then open [http://localhost:8080](http://localhost:8080). Vite rebuilds and live-reloads when you change TypeScript, Svelte, or CSS.

Release assets go to `dist/`:

```bash
make build
```

Serve that folder with any static file server.

## Using the canvas

- Drag a block icon from the left pane onto the canvas (or double-click a palette item to drop it in the center).
- Click or drag from an output handle to an input handle to ground a type. Inferred parameters and port types update on the block.
- Control Systems (`cs`): wire Timer → Quantizer → Sin → Oscilloscope. The timer pushes samples on its own interval. Click Chart on Oscilloscope for a live Chart.js plot.
- Scroll to zoom toward the cursor. Use the zoom controls in the lower-right, or **View** in the menu.
- Drag empty canvas space to pan. Drag a placed block to move it.
- **Delete** / **Backspace** removes the selected block or connector. **Ctrl/Cmd+0** resets the view.

## Stack

- Svelte 5 (CSR)
- Custom elements (`bld-node`, `bld-connector`) for the diagram
- [Chart.js](https://www.chartjs.org/) for the oscilloscope (dark mode)
- Vite
- TypeScript (ES2025)
- Bootstrap 5.3.8, dark theme (`data-bs-theme="dark"`)
