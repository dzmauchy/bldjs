<script lang="ts">
  import { onMount } from "svelte";
  import { type BlockDef, type Link } from "$lib/blocks";
  import {
    BLOCK_WIDTH,
    GRID_SIZE,
    NONE_ID,
    PORT_HEADER,
    PORT_PARAM,
    PORT_ROW,
    blockCardHeight,
    clampZoom,
    zoomToward,
  } from "$lib/model";
  import { type BlockInstance } from "$lib/state.svelte";
  import { getAppState } from "$lib/context";
  import BlockCard from "./BlockCard.svelte";

  const app = getAppState();

  type PointerMode = { kind: "pan" } | { kind: "move"; id: number };
  interface PointerSession {
    mode: PointerMode;
    lastX: number;
    lastY: number;
  }

  let viewport: HTMLDivElement | undefined = $state();
  let session = $state<PointerSession | null>(null);

  const resolved = $derived(app.resolveAll());

  function syncViewportSize(): void {
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    app.viewportW = rect.width;
    app.viewportH = rect.height;
  }

  function localPoint(clientX: number, clientY: number): [number, number] | undefined {
    if (!viewport) {
      return undefined;
    }
    const rect = viewport.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  }

  function paramOffset(def: BlockDef): number {
    return def.params.length === 0 ? 0 : PORT_PARAM;
  }

  function inputPortPos(block: BlockInstance, def: BlockDef, port: string): [number, number] {
    const index = def.inputs.findIndex((item) => item.name === port);
    const y = block.y + PORT_HEADER + paramOffset(def) + Math.max(index, 0) * PORT_ROW + PORT_ROW / 2;
    return [block.x, y];
  }

  function outputPortPos(block: BlockInstance, def: BlockDef, port: string): [number, number] {
    const index = def.outputs.findIndex((item) => item.name === port);
    const y = block.y + PORT_HEADER + paramOffset(def) + Math.max(index, 0) * PORT_ROW + PORT_ROW / 2;
    return [block.x + BLOCK_WIDTH, y];
  }

  function linkPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  function linkGeometry(link: Link): { d: string; key: string } | undefined {
    const from = app.blocks.find((block) => block.id === link.fromBlock);
    const to = app.blocks.find((block) => block.id === link.toBlock);
    if (!from || !to) {
      return undefined;
    }
    const fromDef = app.catalog.block(from.defId);
    const toDef = app.catalog.block(to.defId);
    if (!fromDef || !toDef) {
      return undefined;
    }
    const [x1, y1] = outputPortPos(from, fromDef, link.fromOut);
    const [x2, y2] = inputPortPos(to, toDef, link.toIn);
    return {
      d: linkPath(x1, y1, x2, y2),
      key: `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`,
    };
  }

  const linkPaths = $derived(
    app.links.map((link) => linkGeometry(link)).filter((item): item is { d: string; key: string } => item !== undefined),
  );

  const draggingBlock = $derived(app.blocks.find((block) => block.id === app.draggingId));
  const footprintHeight = $derived.by(() => {
    if (!draggingBlock) {
      return 118;
    }
    const def = app.blockDef(draggingBlock.defId);
    if (!def) {
      return 118;
    }
    return blockCardHeight(def.inputs.length, def.outputs.length, def.params.length > 0);
  });

  onMount(() => {
    syncViewportSize();
    const onResize = () => syncViewportSize();
    const onMove = (event: PointerEvent) => {
      if (!session) {
        return;
      }
      const dx = event.clientX - session.lastX;
      const dy = event.clientY - session.lastY;
      session = { ...session, lastX: event.clientX, lastY: event.clientY };
      if (session.mode.kind === "pan") {
        app.panX += dx;
        app.panY += dy;
      } else {
        const zoom = app.zoom;
        app.moveBlock(session.mode.id, dx / zoom, dy / zoom);
      }
    };
    const onUp = () => {
      app.tryOpenOscilloscopeClick();
      session = null;
      app.draggingId = NONE_ID;
    };
    const onCancel = () => {
      session = null;
      app.draggingId = NONE_ID;
      app.draggingDefId = null;
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  });

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const point = localPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const [cursorX, cursorY] = point;
    const oldZoom = app.zoom;
    const factor = Math.min(1.25, Math.max(0.8, 1 - event.deltaY * 0.0015));
    const newZoom = clampZoom(oldZoom * factor);
    if (Math.abs(newZoom - oldZoom) < 1e-9) {
      return;
    }
    const [panX, panY] = zoomToward(oldZoom, newZoom, cursorX, cursorY, app.panX, app.panY);
    app.zoom = newZoom;
    app.panX = panX;
    app.panY = panY;
  }

  function onViewportPointerDown(event: PointerEvent): void {
    if (app.draggingDefId !== null) {
      return;
    }
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    const target = event.target;
    if (target instanceof Element) {
      if (
        target.closest(".canvas-block") ||
        target.closest(".canvas-toolbar") ||
        target.closest(".block-port-row")
      ) {
        return;
      }
    }
    if (event.button === 0) {
      app.selected = NONE_ID;
      app.linkingFrom = null;
    }
    session = { mode: { kind: "pan" }, lastX: event.clientX, lastY: event.clientY };
  }

  function onBlockPointerDown(event: PointerEvent, block: BlockInstance): void {
    if (app.draggingDefId !== null) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest(".block-port-row")) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    app.selected = block.id;
    app.draggingId = block.id;
    app.dragOriginX = block.x;
    app.dragOriginY = block.y;
    session = { mode: { kind: "move", id: block.id }, lastX: event.clientX, lastY: event.clientY };
  }

  function onBlockPointerUp(block: BlockInstance): void {
    if (block.defId !== "oscilloscope") {
      return;
    }
    if (app.draggingId !== block.id) {
      return;
    }
    const dx = Math.abs(block.x - app.dragOriginX);
    const dy = Math.abs(block.y - app.dragOriginY);
    if (dx < 4 && dy < 4) {
      app.openOscilloscope(block.id);
    }
  }
</script>

<main class="workspace d-flex flex-column flex-grow-1 min-h-0">
  <div
    class="canvas-viewport flex-grow-1 min-h-0"
    class:is-panning={session?.mode.kind === "pan"}
    class:is-moving-block={app.draggingId !== NONE_ID}
    class:is-linking={app.linkingFrom !== null}
    class:drop-target={app.draggingDefId !== null}
    role="application"
    aria-label="Diagram canvas"
    bind:this={viewport}
    onwheel={onWheel}
    onpointerdown={onViewportPointerDown}
  >
    <div
      class="canvas-grid"
      style:background-size={`${GRID_SIZE * app.zoom}px ${GRID_SIZE * app.zoom}px`}
      style:background-position={`${app.panX}px ${app.panY}px`}
    ></div>
    <div
      class="canvas-world"
      style:transform={`translate(${app.panX}px, ${app.panY}px) scale(${app.zoom})`}
    >
      <svg class="canvas-links" overflow="visible">
        {#each linkPaths as path (path.key)}
          <path class="block-link" d={path.d} fill="none"></path>
        {/each}
      </svg>
      {#if app.draggingId !== NONE_ID}
        <div
          class="canvas-block-footprint"
          style:position="absolute"
          style:left={`${app.dragOriginX}px`}
          style:top={`${app.dragOriginY}px`}
          style:height={`${footprintHeight}px`}
        ></div>
      {/if}
      {#each app.blocks as block (block.id)}
        {@const def = app.blockDef(block.defId)}
        {#if def}
          <div
            class="canvas-block"
            class:selected={app.selected === block.id}
            class:is-dragging={app.draggingId === block.id}
            role="group"
            aria-label={def.name}
            style:position="absolute"
            style:left={`${block.x}px`}
            style:top={`${block.y}px`}
            onpointerdown={(event) => onBlockPointerDown(event, block)}
            onpointerup={() => onBlockPointerUp(block)}
          >
            <BlockCard {def} id={block.id} resolved={resolved.get(block.id)} />
          </div>
        {/if}
      {/each}
    </div>
    <div class="canvas-hint" class:d-none={app.blocks.length > 0}>
      <div class="canvas-hint-card">
        <div class="fw-semibold mb-1">Drop blocks here</div>
        <div class="small text-secondary">
          Drag from the left pane. Click an output, then an input, to ground types.
        </div>
      </div>
    </div>
    <div class="canvas-toolbar btn-group">
      <button
        class="btn btn-sm btn-outline-secondary"
        type="button"
        title="Zoom out"
        disabled={!app.canZoomOut()}
        onclick={() => app.zoomOut()}
      >
        −
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        type="button"
        title="Reset view"
        onclick={() => app.resetView()}
      >
        {app.zoomPercent()}%
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        type="button"
        title="Zoom in"
        disabled={!app.canZoomIn()}
        onclick={() => app.zoomIn()}
      >
        +
      </button>
    </div>
  </div>
</main>
