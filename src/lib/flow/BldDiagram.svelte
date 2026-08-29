<svelte:options
  customElement={{
    tag: "bld-diagram",
    shadow: "open",
    props: {
      app: { type: "Object", reflect: false },
    },
  }}
/>

<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    isResolvedCompatible,
    resolvedInput,
    resolvedOutput,
    typeToString,
    type Link,
  } from "$lib/blocks";
  import { GRID_SIZE, clampZoom, zoomToward } from "$lib/model";
  import { type AppState, type BlockInstance } from "$lib/state.svelte";
  import { FLOW_MIME } from "./mime";
  import { clientToWorld, linkKey, type Point } from "./geometry";
  import { portFromComposedPath, worldPort } from "./layout";
  import type { BldNodeState, NodeLayout, PortPointerDetail } from "./types";
  import "./BldNode.svelte";
  import "./BldConnector.svelte";

  let { app }: { app: AppState } = $props();

  const LINK_DRAG = 8;

  type PointerSession =
    | { kind: "pan"; lastX: number; lastY: number }
    | { kind: "move"; id: number; lastX: number; lastY: number }
    | { kind: "link"; fromBlock: number; fromPort: string; startX: number; startY: number; dragged: boolean };

  let viewportEl: HTMLDivElement | undefined = $state();
  let session = $state<PointerSession | null>(null);
  let previewTo = $state<Point | null>(null);
  let layouts = $state(new Map<number, NodeLayout>());

  const resolved = $derived(app.resolveAll());

  const connectors = $derived.by(() => {
    const views: { key: string; link: Link; from: Point; to: Point; selected: boolean }[] = [];
    for (const link of app.links) {
      const fromBlock = app.blocks.find((block) => block.id === link.fromBlock);
      const toBlock = app.blocks.find((block) => block.id === link.toBlock);
      const from = worldPort(fromBlock, layouts.get(link.fromBlock), "out", link.fromOut);
      const to = worldPort(toBlock, layouts.get(link.toBlock), "in", link.toIn);
      if (!from || !to) {
        continue;
      }
      views.push({
        key: linkKey(link.fromBlock, link.fromOut, link.toBlock, link.toIn),
        link,
        from,
        to,
        selected: app.isLinkSelected(link),
      });
    }
    return views;
  });

  const previewFrom = $derived.by(() => {
    const linking = app.linkingFrom;
    if (!linking) {
      return null;
    }
    const block = app.blocks.find((item) => item.id === linking.blockId);
    return worldPort(block, layouts.get(linking.blockId), "out", linking.port) ?? null;
  });

  function viewportRect(): DOMRect | undefined {
    return viewportEl?.getBoundingClientRect() ?? $host().getBoundingClientRect();
  }

  function toWorld(clientX: number, clientY: number): Point | undefined {
    const rect = viewportRect();
    if (!rect) {
      return undefined;
    }
    return clientToWorld(clientX, clientY, rect, app.panX, app.panY, app.zoom);
  }

  function paramLine(blockId: number): string {
    const block = resolved.get(blockId);
    if (!block || block.params.size === 0) {
      return "";
    }
    return block.params
      .entries()
      .toArray()
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([name, ty]) => `${name} = ${typeToString(ty)}`)
      .join(" · ");
  }

  function nodeState(block: BlockInstance): BldNodeState | null {
    const def = app.blockDef(block.defId);
    if (!def) {
      return null;
    }
    const kind = app.kindOf(def);
    const resolvedBlock = resolved.get(block.id);
    return {
      blockId: block.id,
      defId: block.defId,
      name: def.name,
      icon: def.icon,
      kindClass: kind.className,
      selected: app.selected === block.id,
      paramsLine: paramLine(block.id),
      showChart: block.defId === "oscilloscope",
      inputs: def.inputs.map((port) => ({
        name: port.name,
        typeLabel: typeToString(resolvedBlock ? (resolvedInput(resolvedBlock, port.name) ?? port.ty) : port.ty),
        vararg: port.vararg,
        grounded: app.inputIsGrounded(block.id, port.name),
        compatible: resolvedBlock ? isResolvedCompatible(resolvedBlock, port.name) : true,
      })),
      outputs: def.outputs.map((port) => ({
        name: port.name,
        typeLabel: typeToString(resolvedBlock ? (resolvedOutput(resolvedBlock, port.name) ?? port.ty) : port.ty),
        vararg: port.vararg,
        linking: app.linkingFrom?.blockId === block.id && app.linkingFrom.port === port.name,
      })),
    };
  }

  function syncHostSize(): void {
    const host = $host();
    app.viewportW = host.offsetWidth;
    app.viewportH = host.offsetHeight;
  }

  function rememberLayout(blockId: number, layout: NodeLayout): void {
    const prev = layouts.get(blockId);
    if (
      prev &&
      prev.width === layout.width &&
      prev.height === layout.height &&
      JSON.stringify(prev.ports) === JSON.stringify(layout.ports)
    ) {
      return;
    }
    const next = new Map(layouts);
    next.set(blockId, layout);
    layouts = next;
  }

  function finishLink(toBlock: number, toIn: string): void {
    const from = app.linkingFrom;
    if (!from || from.blockId === toBlock) {
      return;
    }
    app.toggleLink(from.blockId, from.port, toBlock, toIn);
    app.linkingFrom = null;
    previewTo = null;
    session = null;
  }

  function onPortDown(detail: PortPointerDetail): void {
    if (detail.side === "out") {
      app.linkingFrom = { blockId: detail.blockId, port: detail.port };
      previewTo = toWorld(detail.clientX, detail.clientY) ?? null;
      session = {
        kind: "link",
        fromBlock: detail.blockId,
        fromPort: detail.port,
        startX: detail.clientX,
        startY: detail.clientY,
        dragged: false,
      };
      return;
    }
    if (app.linkingFrom) {
      finishLink(detail.blockId, detail.port);
    }
  }

  function onPortUp(detail: PortPointerDetail): void {
    if (detail.side === "in" && app.linkingFrom) {
      finishLink(detail.blockId, detail.port);
    }
  }

  function onWinMove(event: PointerEvent): void {
    if (app.linkingFrom) {
      previewTo = toWorld(event.clientX, event.clientY) ?? previewTo;
    }
    if (!session) {
      return;
    }
    if (session.kind === "pan") {
      const dx = event.clientX - session.lastX;
      const dy = event.clientY - session.lastY;
      session = { ...session, lastX: event.clientX, lastY: event.clientY };
      app.panX += dx;
      app.panY += dy;
      return;
    }
    if (session.kind === "move") {
      const dx = event.clientX - session.lastX;
      const dy = event.clientY - session.lastY;
      session = { ...session, lastX: event.clientX, lastY: event.clientY };
      app.moveBlock(session.id, dx / app.zoom, dy / app.zoom);
      return;
    }
    const dist = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
    if (dist >= LINK_DRAG) {
      session = { ...session, dragged: true };
    }
  }

  function onWinUp(event: PointerEvent): void {
    const hit = portFromComposedPath(event);
    if (session?.kind === "link" || app.linkingFrom) {
      if (hit?.side === "in") {
        finishLink(Number(hit.host.dataset.blockId), hit.port);
        return;
      }
      if (session?.kind === "link" && session.dragged) {
        app.linkingFrom = null;
        previewTo = null;
      }
      session = null;
      return;
    }
    session = null;
  }

  function onViewportPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    const path = event.composedPath();
    if (path.some((item) => item instanceof Element && item.closest(".toolbar"))) {
      return;
    }
    const node = path.find((item) => item instanceof HTMLElement && item.localName === "bld-node");
    if (node instanceof HTMLElement) {
      if (portFromComposedPath(event)) {
        return;
      }
      event.stopPropagation();
      const id = Number(node.dataset.blockId);
      app.selectBlock(id);
      session = { kind: "move", id, lastX: event.clientX, lastY: event.clientY };
      return;
    }
    if (event.button === 0) {
      app.clearSelection();
      app.linkingFrom = null;
      previewTo = null;
    }
    session = { kind: "pan", lastX: event.clientX, lastY: event.clientY };
  }

  function onHostDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function onHostDrop(event: DragEvent): void {
    event.preventDefault();
    const defId = app.draggingDefId ?? event.dataTransfer?.getData(FLOW_MIME) ?? null;
    app.draggingDefId = null;
    if (!defId || !app.blockDef(defId)) {
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    if (!world) {
      return;
    }
    app.addBlock(defId, world.x, world.y);
  }

  function onLinkPointerDown(link: Link): void {
    app.selectLink(link);
    app.linkingFrom = null;
    previewTo = null;
    session = null;
  }

  onMount(() => {
    const host = $host();
    syncHostSize();
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewportRect();
      if (!rect) {
        return;
      }
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
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
    };
    const resize =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            syncHostSize();
          })
        : null;
    resize?.observe(host);
    host.addEventListener("dragover", onHostDragOver);
    host.addEventListener("drop", onHostDrop);
    host.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    void tick().then(syncHostSize);
    return () => {
      resize?.disconnect();
      host.removeEventListener("dragover", onHostDragOver);
      host.removeEventListener("drop", onHostDrop);
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
    };
  });
</script>

<div
  class="viewport"
  class:is-panning={session?.kind === "pan"}
  class:is-moving-block={session?.kind === "move"}
  class:is-linking={app.linkingFrom !== null}
  class:drop-target={app.draggingDefId !== null}
  role="application"
  aria-label="Diagram canvas"
  data-testid="diagram-canvas"
  bind:this={viewportEl}
  onpointerdown={onViewportPointerDown}
>
  <div
    class="grid"
    style:background-size={`${GRID_SIZE * app.zoom}px ${GRID_SIZE * app.zoom}px`}
    style:background-position={`${app.panX}px ${app.panY}px`}
  ></div>
  <div class="world" style:transform={`translate(${app.panX}px, ${app.panY}px) scale(${app.zoom})`}>
    {#each connectors as item (item.key)}
      <bld-connector
        data-link={item.key}
        from={item.from}
        to={item.to}
        selected={item.selected}
        onlinkpointerdown={() => onLinkPointerDown(item.link)}
      ></bld-connector>
    {/each}
    {#if previewFrom && previewTo}
      <bld-connector from={previewFrom} to={previewTo} preview={true}></bld-connector>
    {/if}
    {#each app.blocks as block (block.id)}
      {@const state = nodeState(block)}
      {#if state}
        <bld-node
          view={state}
          x={block.x}
          y={block.y}
          dragging={session?.kind === "move" && session.id === block.id}
          onportpointerdown={(event: CustomEvent<PortPointerDetail>) => onPortDown(event.detail)}
          onportpointerup={(event: CustomEvent<PortPointerDetail>) => onPortUp(event.detail)}
          onchartclick={() => app.openOscilloscope(block.id)}
          onnoderesize={(event: CustomEvent<NodeLayout>) => rememberLayout(block.id, event.detail)}
        ></bld-node>
      {/if}
    {/each}
  </div>
  {#if app.blocks.length === 0}
    <div class="hint">
      <div class="hint-card">
        <div class="hint-title">Drop blocks here</div>
        <div class="hint-copy">Drag from the left pane. Click or drag an output handle, then an input.</div>
      </div>
    </div>
  {/if}
  <div class="toolbar" data-testid="canvas-controls">
    <button type="button" title="Zoom out" data-testid="zoom-out" disabled={!app.canZoomOut()} onclick={() => app.zoomOut()}>
      −
    </button>
    <button type="button" title="Reset view" data-testid="zoom-reset" onclick={() => app.resetView()}>
      {app.zoomPercent()}%
    </button>
    <button type="button" title="Zoom in" data-testid="zoom-in" onclick={() => app.zoomIn()}>+</button>
  </div>
</div>

<style>
  :host {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    position: relative;
  }
  .viewport {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: #14171a;
    cursor: grab;
    touch-action: none;
  }
  .viewport.is-panning,
  .viewport.is-moving-block {
    cursor: grabbing;
  }
  .viewport.is-linking {
    cursor: crosshair;
  }
  .viewport.drop-target {
    outline: 2px dashed var(--bs-primary, #0d6efd);
    outline-offset: -8px;
    background: #17202a;
  }
  .grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.045) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
  }
  .viewport.drop-target .grid {
    background-image:
      linear-gradient(to right, rgba(13, 110, 253, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(13, 110, 253, 0.12) 1px, transparent 1px);
  }
  .world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }
  .hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 1;
  }
  .hint-card {
    display: flex;
    flex-direction: column;
    padding: 1rem 1.25rem;
    border: 1px dashed var(--bs-border-color, #495057);
    border-radius: 0.75rem;
    background: rgba(20, 23, 26, 0.72);
    text-align: center;
    max-width: 280px;
    color: var(--bs-body-color, #dee2e6);
  }
  .hint-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .hint-copy {
    font-size: 0.875rem;
    color: var(--bs-secondary-color, #adb5bd);
  }
  .toolbar {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    background: #1c2125;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.4rem;
    overflow: hidden;
    z-index: 2;
  }
  .toolbar button {
    border: 0;
    border-right: 1px solid var(--bs-border-color, #495057);
    background: #1c2125;
    color: var(--bs-body-color, #dee2e6);
    padding: 0.25rem 0.55rem;
    cursor: pointer;
  }
  .toolbar button:last-child {
    border-right: 0;
  }
  .toolbar button:hover:not(:disabled) {
    background: #2b3238;
  }
  .toolbar button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
