# Bld

A client-side [Solid](https://www.solidjs.com/) app. The workspace is custom elements: a toolbar (Run / Stop, plus a three-line menu), a left palette of block icons, and
a `bld-diagram` canvas that owns pan, zoom, drop, and wiring. Nodes (`bld-node`) and connectors (`bld-connector`) are also custom elements with shadow trees;
nodes size themselves with flex, and connectors are JointJS [`jumpover`](https://docs.jointjs.com/api/connectors/#jumpover) paths (`size: 5`, `radius: 5`,
`jump: 'cubic'`) drawn as CSS `clip-path` polygons, routed around other nodes by [
`initAvoidRouter({ worker: true })`](https://docs.jointjs.com/api/avoid-router/initAvoidRouter/).

Diagrams load a TypeScript catalog (`packages/model/src/resources/models/model.ts`). The TypeScript 7.0.2 TypeChecker infers port types and input/output compatibility. The builtin model
uses typed-array aliases (`type f32 = Float32Array[1]`, `type Multiplexed<T> = T[]`), function types `(f32)->void` (`c<T>`), and real ES2025 block implementations that run in a worker.

This is a TypeScript port of the Rust/Leptos [bld](https://github.com/dzmauchy/bld) workspace. The repo is an npm workspaces monorepo:

```
packages/
  model/ TypeScript catalog, TypeChecker inference, diagram I/O, CS blocks, tsc compile, worker runner
  ui/    workspace UI
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
Content-Security-Policy: script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:;
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

so JointJS libavoid WASM can instantiate, blob workers can run compiled diagrams, and `SharedArrayBuffer` is available (`crossOriginIsolated`) for the avoid-router worker.

Those headers only isolate a **secure context** (HTTPS or `localhost`). Opening `http://192.168.x.x:8080` from a phone is not secure, so `crossOriginIsolated`
stays false. The app then runs the avoid router on the main thread instead of failing to start a worker. `make build` also writes `dist/_headers`
(Netlify / Cloudflare Pages) with the same values.

Release assets go to `dist/`:

```bash
make build
```

`make check` / `npm run check` typechecks the app.

Serve that folder with any static file server that sets the same CSP and isolation headers.

## Using the canvas

- Drag a block icon from the left pane onto the canvas (or double-click a palette item to drop it in the center). On a phone, tap **Blocks** to open the
  overlay, then drag (or tap) a block onto the canvas.
- Click or drag from an output handle to an input handle to ground a type. While a wire is in progress, the source output and every compatible input show their
  type under the port; the labels disappear once the wire is finished or cancelled. On a phone, dropping the wire on a block is enough when that block has only
  one compatible input.
- Phones keep a compact overlay (portrait and landscape): smaller chrome and blocks, a scrollable block list, and canvas pan from a finger drag. The page stays
  at `initial-scale=1` so the browser does not steal those gestures.
- Control Systems (`com.dauch.cs`): wire Scope (`com.dauch.cs.sink`) into a generator — Timer, Constant, Sin, Cos, Random (`com.dauch.cs.gen`), or GPIO In
  (`com.dauch.cs.gpio`). Generator ports are `(f32) -> void`. Scope returns a dynamically sized `Array[(f32) -> void]`; each outgoing wire is one plot
  channel: `sin(plot[0])`. Product (`com.dauch.cs.tf`) takes a downstream consumer and returns `n` factor consumers (`Array[(f32) -> void]`); each factor
  updates its slot and pushes the product of all slots (unwired slots stay at `def`, default 1). GPIO Out is a single `(f32) -> void` sink that writes a
  digital pin (HIGH when the sample is greater than 0.5). Several `(f32) -> void` outputs may share one input; Run inserts a hidden `fork` that forwards each
  sample to every downstream. Each generator has a `period` range input (default 10 ms) for its internal quantizer. Constant also has a `value` range (default
  1). Scope has a time window `n` (default 30 s, 10–600) and quantizer period `m` (default 10 ms, 10–1000); the plot is a sliding `Float64Array` of
  `n * (1000 / m)` measurements whose length is fixed from construction, addressed with a single write pointer. GPIO blocks also have a `pin` range (0–31) and a
  HIGH/LOW toggle that simulates the pin in the browser. GPIO In samples the current pin once when the solution starts, then again on each edge. Blocks with
  configurable inputs show a small button that opens the input editor.
- **Run** serializes the canvas to a TypeScript diagram (the Load/Save payload), infers types from that file and `model.ts`, compiles the diagram with tsc, and
  executes the JavaScript in a worker. Block implementations live in `model.ts`. Scope posts samples to the page on its quantizer period `m`. Each connector has an
  introspector that measures how often the value changes; live wires set `animation-duration` from that Hertz (`1000 / hz`, clamped to 200–2500 ms) via inline
  style. After Run, click Chart on Scope; the plot is a canvas multi-axis line. NaN ticks are stored but not drawn.
- **File** in the three-line menu: **Save…** / **Open…** store named diagrams in IndexedDB (manual only). **Import TypeScript…** / **Export TypeScript** read and write
  diagram files. Those files include decorator definitions, types, block implementations, and `@Diagram` / `@DiagramBlock` / `@Connection` metadata so the editor can
  restore layout (x, y, captions, parameters). **Catalogs** lists associated block catalogs by name and can be toggled for the current diagram.
- Scroll to zoom toward the cursor. Use the zoom controls in the lower-right, or **View** in the three-line menu.
- Drag empty canvas space to pan. Drag a placed block to move it (touch and mouse; the canvas captures the pointer so a phone can drag).
- **Delete** / **Backspace** removes the selected block or edge. **Ctrl/Cmd+0** resets the view.

## Stack

- [Solid](https://www.solidjs.com/) custom elements (CSR)
- [JointJS avoid router](https://docs.jointjs.com/api/avoid-router/initAvoidRouter/) (`initAvoidRouter` in a Worker) plus the [
  `jumpover`](https://docs.jointjs.com/api/connectors/#jumpover) connector (`size: 5`, `radius: 5`, `jump: 'cubic'`) as CSS `clip-path` polygons
- Canvas 2d for the scope (dark mode, multi-axis line)
- TypeScript 7 TypeChecker for catalog extract and `tsc` emit for the worker runtime
- Vite
- Web Awesome 3, dark theme (`class="wa-dark"`)
