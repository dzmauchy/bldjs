# Bld

A client-side [Svelte](https://svelte.dev/) app. The first slice is a dark Bootstrap workspace: a menubar, a left palette of blocks, and a center canvas with zoom and pan.

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

- Drag a block from the left pane onto the canvas (or double-click a palette item to drop it in the center).
- Click an output port, then an input port, to ground a type. Inferred parameters and port types update on the block.
- Control Systems (`cs`): wire Oscilloscope → Sin → Quantizer → Timer. The timer runs on its own interval. Click Oscilloscope to open a live chart.
- Scroll to zoom toward the cursor. Use the zoom control in the lower-right, or **View** in the menu.
- Drag empty canvas space to pan. Drag a placed block to move it.
- **Delete** / **Backspace** removes the selected block. **Ctrl/Cmd+0** resets the view.

## Stack

- Svelte 5 (CSR)
- Vite
- TypeScript
- Bootstrap 5.3.8, dark theme (`data-bs-theme="dark"`)
