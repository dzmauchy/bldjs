<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { type Link } from "$lib/blocks";
  import {
    isResolvedCompatible,
    resolvedInput,
    resolvedOutput,
    typeToString,
  } from "$lib/blocks";
  import {
    BldNode,
    FLOW_MIME,
    clientToWorld,
    linkKey,
    registerFlowElements,
    type BldNodeState,
    type Point,
    type PortPointerDetail,
  } from "$lib/flow";
  import { GRID_SIZE, clampZoom, zoomToward } from "$lib/model";
  import { type BlockInstance } from "$lib/state.svelte";
  import { getAppState } from "$lib/context";

  registerFlowElements();

  const app = getAppState();
  const LINK_DRAG = 8;

  type PointerSession =
    | { kind: "pan"; lastX: number; lastY: number }
    | { kind: "move"; id: number; lastX: number; lastY: number }
    | { kind: "link"; fromBlock: number; fromPort: string; startX: number; startY: number; dragged: boolean };

  let viewportEl: HTMLDivElement | undefined = $state();
  let worldEl: HTMLDivElement | undefined = $state();
  let session = $state<PointerSession | null>(null);
  let measureGen = $state(0);
  let previewTo = $state<Point | null>(null);

  const resolved = $derived(app.resolveAll());

  interface ConnectorView {
    key: string;
    link: Link;
    from: Point;
    to: Point;
    selected: boolean;
  }

  let connectors = $state<ConnectorView[]>([]);

  const previewFrom = $derived.by(() => {
    const linking = app.linkingFrom;
    if (!linking) {
      return null;
    }
    return portWorld(linking.blockId, "out", linking.port);
  });

  function nodeEl(id: number): BldNode | undefined {
    return worldEl?.querySelector(`bld-node[data-block-id="${id}"]`) ?? undefined;
  }

  function viewportRect(): DOMRect | undefined {
    return viewportEl?.getBoundingClientRect();
  }

  function portWorld(blockId: number, side: "in" | "out", port: string): Point | undefined {
    const rect = viewportRect();
    const host = nodeEl(blockId);
    const client = host?.portCenterClient(side, port);
    if (!rect || !client) {
      return undefined;
    }
    return clientToWorld(client.x, client.y, rect, app.panX, app.panY, app.zoom);
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

  function measureConnectors(): void {
    const rect = viewportRect();
    if (!rect) {
      connectors = [];
      return;
    }
    const next: ConnectorView[] = [];
    for (const link of app.links) {
      const from = portWorld(link.fromBlock, "out", link.fromOut);
      const to = portWorld(link.toBlock, "in", link.toIn);
      if (!from || !to) {
        continue;
      }
      next.push({
        key: linkKey(link.fromBlock, link.fromOut, link.toBlock, link.toIn),
        link,
        from,
        to,
        selected: app.isLinkSelected(link),
      });
    }
    connectors = next;
  }

  $effect(() => {
    void app.blocks;
    void app.links;
    void app.zoom;
    void app.panX;
    void app.panY;
    void app.selectedLink;
    void measureGen;
    void resolved;
    void tick().then(() => {
      untrack(() => measureConnectors());
    });
  });

  function syncViewportSize(): void {
    if (!viewportEl) {
      return;
    }
    const rect = viewportEl.getBoundingClientRect();
    app.viewportW = rect.width;
    app.viewportH = rect.height;
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
    const hit = BldNode.fromComposedPath(event);
    if (session?.kind === "link" || app.linkingFrom) {
      if (hit?.side === "in") {
        finishLink(hit.node.blockId, hit.port);
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

  onMount(() => {
    syncViewportSize();
    const onResize = () => syncViewportSize();
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
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    viewportEl?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
      viewportEl?.removeEventListener("wheel", onWheel);
    };
  });

  onDestroy(() => {
    session = null;
  });

  function onViewportPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    const path = event.composedPath();
    if (path.some((item) => item instanceof Element && item.closest(".canvas-toolbar"))) {
      return;
    }
    const node = path.find((item) => item instanceof BldNode);
    if (node instanceof BldNode) {
      if (BldNode.fromComposedPath(event)) {
        return;
      }
      event.stopPropagation();
      app.selectBlock(node.blockId);
      session = { kind: "move", id: node.blockId, lastX: event.clientX, lastY: event.clientY };
      return;
    }
    if (event.button === 0) {
      app.clearSelection();
      app.linkingFrom = null;
      previewTo = null;
    }
    session = { kind: "pan", lastX: event.clientX, lastY: event.clientY };
  }

  function ondragover(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function ondrop(event: DragEvent): void {
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
</script>

<main class="workspace d-flex flex-column flex-grow-1 min-h-0">
  <div
    class="canvas-viewport flex-grow-1 min-h-0"
    class:is-panning={session?.kind === "pan"}
    class:is-moving-block={session?.kind === "move"}
    class:is-linking={app.linkingFrom !== null}
    class:drop-target={app.draggingDefId !== null}
    role="application"
    aria-label="Diagram canvas"
    data-testid="diagram-canvas"
    bind:this={viewportEl}
    onpointerdown={onViewportPointerDown}
    ondragover={ondragover}
    ondrop={ondrop}
  >
    <div
      class="canvas-grid"
      style:background-size={`${GRID_SIZE * app.zoom}px ${GRID_SIZE * app.zoom}px`}
      style:background-position={`${app.panX}px ${app.panY}px`}
    ></div>
    <div
      class="canvas-world"
      bind:this={worldEl}
      style:transform={`translate(${app.panX}px, ${app.panY}px) scale(${app.zoom})`}
    >
      {#each connectors as item (item.key)}
        <bld-connector
          data-testid="connector"
          data-link={item.key}
          endpoints={{ from: item.from, to: item.to }}
          selected={item.selected}
          onlinkpointerdown={() => onLinkPointerDown(item.link)}
        ></bld-connector>
      {/each}
      {#if previewFrom && previewTo}
        <bld-connector
          data-testid="connector-preview"
          endpoints={{ from: previewFrom, to: previewTo }}
          preview={true}
        ></bld-connector>
      {/if}
      {#each app.blocks as block (block.id)}
        {@const state = nodeState(block)}
        {#if state}
          <bld-node
            data-block-id={block.id}
            data-block-def={block.defId}
            data-testid="node"
            data-dragging={session?.kind === "move" && session.id === block.id ? "" : undefined}
            style={`transform: translate(${block.x}px, ${block.y}px)`}
            {state}
            onportpointerdown={(event: CustomEvent<PortPointerDetail>) => onPortDown(event.detail)}
            onportpointerup={(event: CustomEvent<PortPointerDetail>) => onPortUp(event.detail)}
            onchartclick={() => app.openOscilloscope(block.id)}
            onnoderesize={() => {
              measureGen += 1;
            }}
          ></bld-node>
        {/if}
      {/each}
    </div>
    {#if app.blocks.length === 0}
      <div class="canvas-hint">
        <div class="canvas-hint-card">
          <div class="fw-semibold mb-1">Drop blocks here</div>
          <div class="small text-secondary">
            Drag from the left pane. Click or drag an output handle, then an input.
          </div>
        </div>
      </div>
    {/if}
    <div class="canvas-toolbar btn-group" data-testid="canvas-controls">
      <button
        class="btn btn-sm btn-outline-secondary"
        type="button"
        title="Zoom out"
        data-testid="zoom-out"
        disabled={!app.canZoomOut()}
        onclick={() => app.zoomOut()}
      >
        −
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        type="button"
        title="Reset view"
        data-testid="zoom-reset"
        onclick={() => app.resetView()}
      >
        {app.zoomPercent()}%
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        type="button"
        title="Zoom in"
        data-testid="zoom-in"
        onclick={() => app.zoomIn()}
      >
        +
      </button>
    </div>
  </div>
</main>
