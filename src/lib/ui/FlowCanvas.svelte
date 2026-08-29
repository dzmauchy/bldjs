<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    Background,
    BackgroundVariant,
    ConnectionMode,
    SvelteFlow,
    useSvelteFlow,
    type Connection,
    type Edge,
    type IsValidConnection,
    type Node,
    type OnConnectStartParams,
    type Viewport,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { BLOCK_WIDTH, GRID_SIZE, MAX_ZOOM, MIN_ZOOM, NONE_ID } from "$lib/model";
  import { getAppState } from "$lib/context";
  import FlowBlock from "./FlowBlock.svelte";

  type BlockNode = Node<{ defId: string }, "block">;

  const app = getAppState();
  const nodeTypes = { block: FlowBlock };
  const flow = $derived(useSvelteFlow());

  let viewportEl: HTMLDivElement | undefined = $state();
  let nodes = $state.raw<BlockNode[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let viewport = $state.raw<Viewport>({ x: 48, y: 48, zoom: 1 });
  let lastTopo = "";

  const defaultEdgeOptions = {
    style: "stroke-width: 2.2",
  };

  $effect(() => {
    const topo = app.blocks.map((block) => `${block.id}:${block.defId}`).join(",");
    if (topo === lastTopo) {
      return;
    }
    lastTopo = topo;
    const prev = new Map(nodes.map((node) => [node.id, node]));
    nodes = app.blocks.map((block) => {
      const existing = prev.get(String(block.id));
      return {
        id: String(block.id),
        type: "block",
        position: existing?.position ?? { x: block.x, y: block.y },
        data: { defId: block.defId },
        width: BLOCK_WIDTH,
        origin: [0, 0] as [number, number],
      };
    });
  });

  $effect(() => {
    edges = app.links.map((link) => ({
      id: `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`,
      source: String(link.fromBlock),
      sourceHandle: link.fromOut,
      target: String(link.toBlock),
      targetHandle: link.toIn,
    }));
  });

  $effect(() => {
    app.syncViewport(viewport.x, viewport.y, viewport.zoom);
  });

  $effect(() => {
    const controller = flow;
    app.viewport = {
      zoomIn: () => {
        void controller.zoomIn();
      },
      zoomOut: () => {
        void controller.zoomOut();
      },
      resetView: () => {
        void controller.setViewport({ x: 48, y: 48, zoom: 1 });
      },
      screenToFlow: (clientX, clientY) => controller.screenToFlowPosition({ x: clientX, y: clientY }),
      getViewport: () => controller.getViewport(),
    };
  });

  onDestroy(() => {
    app.viewport = null;
  });

  function syncViewportSize(): void {
    if (!viewportEl) {
      return;
    }
    const rect = viewportEl.getBoundingClientRect();
    app.viewportW = rect.width;
    app.viewportH = rect.height;
  }

  onMount(() => {
    syncViewportSize();
    const onResize = () => syncViewportSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const isValidConnection: IsValidConnection = (connection) => {
    if (connection.source === connection.target) {
      return false;
    }
    return Boolean(connection.sourceHandle && connection.targetHandle);
  };

  function onconnect(connection: Connection): void {
    if (!connection.sourceHandle || !connection.targetHandle) {
      return;
    }
    app.toggleLink(
      Number(connection.source),
      connection.sourceHandle,
      Number(connection.target),
      connection.targetHandle,
    );
  }

  function onConnectStart(_event: MouseEvent | TouchEvent, params: OnConnectStartParams): void {
    if (params.nodeId && params.handleId) {
      app.linkingFrom = { blockId: Number(params.nodeId), port: params.handleId };
    }
  }

  function onConnectEnd(): void {
    app.linkingFrom = null;
  }

  function onnodedrag({ nodes: dragged }: { nodes: BlockNode[] }): void {
    for (const node of dragged) {
      app.moveBlockTo(Number(node.id), node.position.x, node.position.y);
    }
  }

  function onselectionchange({ nodes: selected }: { nodes: BlockNode[] }): void {
    app.selected = selected[0] ? Number(selected[0].id) : NONE_ID;
  }

  function onpaneclick(): void {
    app.selected = NONE_ID;
    app.linkingFrom = null;
  }
</script>

<main class="workspace d-flex flex-column flex-grow-1 min-h-0">
  <div
    class="canvas-viewport flex-grow-1 min-h-0"
    class:is-linking={app.linkingFrom !== null}
    class:drop-target={app.draggingDefId !== null}
    role="application"
    aria-label="Diagram canvas"
    data-testid="diagram-canvas"
    bind:this={viewportEl}
  >
    <SvelteFlow
      bind:nodes
      {edges}
      bind:viewport
      {nodeTypes}
      colorMode="dark"
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      {defaultEdgeOptions}
      {isValidConnection}
      clickConnect={false}
      connectionMode={ConnectionMode.Strict}
      connectionRadius={16}
      connectionDragThreshold={8}
      zoomOnDoubleClick={false}
      deleteKey={null}
      nodeDragThreshold={4}
      attributionPosition="bottom-left"
      class="bld-flow"
      onconnect={onconnect}
      onconnectstart={onConnectStart}
      onclickconnectstart={onConnectStart}
      onconnectend={onConnectEnd}
      onclickconnectend={onConnectEnd}
      onnodedrag={onnodedrag}
      onnodedragstop={onnodedrag}
      onselectionchange={onselectionchange}
      onpaneclick={onpaneclick}
    >
      <Background
        variant={BackgroundVariant.Lines}
        gap={GRID_SIZE}
        patternColor="rgba(255, 255, 255, 0.045)"
        bgColor="#14171a"
      />
    </SvelteFlow>
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
        data-testid="zoom-percent"
        onclick={() => app.resetView()}
      >
        {app.zoomPercent()}%
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        type="button"
        title="Zoom in"
        data-testid="zoom-in"
        disabled={!app.canZoomIn()}
        onclick={() => app.zoomIn()}
      >
        +
      </button>
    </div>
  </div>
</main>
