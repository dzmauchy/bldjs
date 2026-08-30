import { LitElement, css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  isResolvedCompatible,
  resolvedInput,
  resolvedOutput,
  typeToString,
  type Link,
  type ResolvedBlock,
  inputSlotsFor,
  outputSlotsFor,
} from "$lib/blocks";
import { isArrayType } from "$lib/blocks/ast";
import { shouldShowPortType } from "./link-types";
import { AppController } from "$lib/context";
import { GRID_SIZE, clampZoom, zoomToward } from "$lib/model";
import { type AppState, type BlockInstance } from "$lib/state";
import { FLOW_MIME } from "./mime";
import { clientToWorld, connectorPolyline, jumpoverUnderlays, linkKey, type Point } from "./geometry";
import { AvoidRouteEngine, connectorFromLink, obstacleFromBlock } from "./avoid-router";
import { portFromComposedPath, portFromClientPoint, worldPort } from "./layout";
import { capturePointer, isCanvasPointer, releasePointer } from "./pointer";
import type { BldNodeState, NodeLayout, PortPointerDetail } from "./types";
import "./node";
import { BldConnector } from "./connector";

const LINK_DRAG = 8;

type PointerSession =
  | { kind: "pan"; pointerId: number; lastX: number; lastY: number }
  | { kind: "move"; pointerId: number; id: number; lastX: number; lastY: number }
  | { kind: "link"; pointerId: number; fromBlock: number; fromPort: string; startX: number; startY: number; dragged: boolean };

export class BldDiagram extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;
  #session: PointerSession | null = null;
  #previewTo: Point | null = null;
  #layouts = new Map<number, NodeLayout>();
  #resize: ResizeObserver | null = null;
  #avoid = new AvoidRouteEngine();
  #routes = new Map<string, Point[]>();
  #flowTimer: ReturnType<typeof setInterval> | null = null;

  static override styles = css`
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
      overscroll-behavior: none;
      background: #14171a;
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
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
  `;

  constructor() {
    super();
    this.app = undefined as unknown as AppState;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#bindApp();
    this.#syncHostSize();
    this.addEventListener("dragover", this.#onHostDragOver);
    this.addEventListener("drop", this.#onHostDrop);
    this.addEventListener("wheel", this.#onWheel, { passive: false });
    if (typeof ResizeObserver === "function") {
      this.#resize = new ResizeObserver(() => this.#syncHostSize());
      this.#resize.observe(this);
    }
    void this.updateComplete.then(() => this.#syncHostSize());
    void this.#startAvoidRouter();
    this.#flowTimer = setInterval(() => this.#syncFlowRates(), 100);
  }

  disconnectedCallback(): void {
    this.removeEventListener("dragover", this.#onHostDragOver);
    this.removeEventListener("drop", this.#onHostDrop);
    this.removeEventListener("wheel", this.#onWheel);
    this.#resize?.disconnect();
    this.#resize = null;
    this.#avoid.destroy();
    if (this.#flowTimer !== null) {
      clearInterval(this.#flowTimer);
      this.#flowTimer = null;
    }
    super.disconnectedCallback();
  }

  protected override willUpdate(): void {
    this.#bindApp();
    this.#syncRoutes();
  }

  #bindApp(): void {
    if (!this.app || this.#ctrl?.app === this.app) {
      return;
    }
    this.#ctrl = new AppController(this, this.app);
  }

  async #startAvoidRouter(): Promise<void> {
    this.#avoid.onRoutesChanged(() => {
      this.#routes = new Map(this.#avoid.routes);
      this.requestUpdate();
    });
    try {
      await this.#avoid.start({ worker: true });
    } catch (error) {
      console.warn("avoid router failed to load", error);
      return;
    }
    this.dataset.router = "avoid";
    this.dataset.worker = this.#avoid.worker ? "true" : "false";
    this.dataset.connector = "clip-path";
    this.#syncRoutes();
    this.requestUpdate();
  }

  #syncRoutes(): void {
    if (!this.app || !this.#avoid.ready) {
      return;
    }
    const obstacles = [];
    for (const block of this.app.blocks) {
      const layout = this.#layouts.get(block.id);
      if (!layout) {
        continue;
      }
      const obstacle = obstacleFromBlock(block.id, block.x, block.y, layout);
      if (obstacle) {
        obstacles.push(obstacle);
      }
    }
    const connectors = this.app.links
      .filter((link) => this.#layouts.has(link.fromBlock) && this.#layouts.has(link.toBlock))
      .map(connectorFromLink);
    this.#avoid.sync(obstacles, connectors);
  }

  #syncFlowRates(): void {
    if (!this.app) {
      return;
    }
    if (this.app.running) {
      this.app.sampleFlowRates();
    }
    for (const host of this.renderRoot.querySelectorAll("bld-connector")) {
      if (!(host instanceof BldConnector) || host.preview) {
        continue;
      }
      const key = host.getAttribute("data-link");
      host.hz = key && this.app.runBusy() ? this.app.connectorHzForKey(key) : 0;
    }
  }

  #viewportEl(): HTMLDivElement | null {
    return this.renderRoot.querySelector(".viewport");
  }

  #viewportRect(): DOMRect | undefined {
    return this.#viewportEl()?.getBoundingClientRect() ?? this.getBoundingClientRect();
  }

  #toWorld(clientX: number, clientY: number): Point | undefined {
    const rect = this.#viewportRect();
    if (!rect) {
      return undefined;
    }
    return clientToWorld(clientX, clientY, rect, this.app.panX, this.app.panY, this.app.zoom);
  }

  #paramLine(resolved: Map<number, ResolvedBlock>, blockId: number): string {
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

  #nodeState(block: BlockInstance, resolved: Map<number, ResolvedBlock>): BldNodeState | null {
    const def = this.app.blockDef(block.defId);
    if (!def) {
      return null;
    }
    const kind = this.app.kindOf(def);
    const resolvedBlock = resolved.get(block.id);
    const linking = this.app.linkingFrom;
    const sourceResolved = linking ? resolved.get(linking.blockId) : undefined;
    const sourceOut = linking && sourceResolved ? resolvedOutput(sourceResolved, linking.port) : undefined;
    return {
      blockId: block.id,
      defId: block.defId,
      name: def.name,
      icon: def.icon,
      kindClass: kind.className,
      selected: this.app.selected === block.id,
      paramsLine: this.#paramLine(resolved, block.id),
      showChart: block.defId === "oscilloscope",
      chartEnabled: block.defId === "oscilloscope" && this.app.isScopeLive(block.id),
      inputs: inputSlotsFor(def.inputs, block.id, this.app.links).map((slot) => {
        const catalogPort = def.inputs.find((item) => item.name === slot.catalogName)!;
        const ty = resolvedBlock ? (resolvedInput(resolvedBlock, slot.name) ?? catalogPort.ty) : catalogPort.ty;
        return {
          name: slot.name,
          typeLabel: typeToString(ty),
          vararg: catalogPort.vararg && slot.index === 0,
          vectorized: catalogPort.vararg || isArrayType(catalogPort.ty),
          grounded: this.app.inputIsGrounded(block.id, slot.name),
          compatible: resolvedBlock ? isResolvedCompatible(resolvedBlock, slot.catalogName) : true,
          showType: shouldShowPortType(
            linking,
            block.id,
            "in",
            slot.name,
            sourceOut,
            ty,
            this.app.catalog,
            def.params,
          ),
        };
      }),
      outputs: outputSlotsFor(def.outputs, block.id, this.app.links).map((slot) => {
        const catalogPort = def.outputs.find((item) => item.name === slot.catalogName)!;
        const ty = resolvedBlock ? (resolvedOutput(resolvedBlock, slot.name) ?? catalogPort.ty) : catalogPort.ty;
        return {
          name: slot.name,
          typeLabel: typeToString(ty),
          vararg: catalogPort.vararg && slot.index === 0,
          vectorized: catalogPort.vararg || isArrayType(catalogPort.ty),
          linking: linking?.blockId === block.id && linking.port === slot.name,
          showType: shouldShowPortType(
            linking,
            block.id,
            "out",
            slot.name,
            sourceOut,
            ty,
            this.app.catalog,
            def.params,
          ),
        };
      }),
    };
  }

  #syncHostSize(): void {
    if (!this.app) {
      return;
    }
    this.app.viewportW = this.offsetWidth;
    this.app.viewportH = this.offsetHeight;
  }

  #rememberLayout(blockId: number, layout: NodeLayout): void {
    const prev = this.#layouts.get(blockId);
    if (
      prev &&
      prev.width === layout.width &&
      prev.height === layout.height &&
      JSON.stringify(prev.ports) === JSON.stringify(layout.ports)
    ) {
      return;
    }
    const next = new Map(this.#layouts);
    next.set(blockId, layout);
    this.#layouts = next;
    this.requestUpdate();
  }

  #finishLink(toBlock: number, toIn: string): void {
    const from = this.app.linkingFrom;
    if (!from || from.blockId === toBlock) {
      return;
    }
    this.app.toggleLink(from.blockId, from.port, toBlock, toIn);
    this.app.linkingFrom = null;
    this.#previewTo = null;
    this.#endPointer();
    this.requestUpdate();
  }

  #capture(event: PointerEvent): void {
    capturePointer(this.#viewportEl(), event.pointerId);
  }

  #endPointer(pointerId?: number): void {
    const session = this.#session;
    if (!session) {
      return;
    }
    if (pointerId !== undefined && session.pointerId !== pointerId) {
      return;
    }
    releasePointer(this.#viewportEl(), session.pointerId);
    this.#session = null;
  }

  #onPortDown(detail: PortPointerDetail): void {
    if (detail.side === "out") {
      this.app.linkingFrom = { blockId: detail.blockId, port: detail.port };
      this.#previewTo = this.#toWorld(detail.clientX, detail.clientY) ?? null;
      this.#session = {
        kind: "link",
        pointerId: detail.pointerId,
        fromBlock: detail.blockId,
        fromPort: detail.port,
        startX: detail.clientX,
        startY: detail.clientY,
        dragged: false,
      };
      capturePointer(this.#viewportEl(), detail.pointerId);
      this.requestUpdate();
      return;
    }
    if (this.app.linkingFrom) {
      this.#finishLink(detail.blockId, detail.port);
    }
  }

  #onPortUp(detail: PortPointerDetail): void {
    if (detail.side === "in" && this.app.linkingFrom) {
      this.#finishLink(detail.blockId, detail.port);
    }
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.app) {
      return;
    }
    if (this.#session && this.#session.pointerId !== event.pointerId) {
      return;
    }
    if (this.app.linkingFrom) {
      this.#previewTo = this.#toWorld(event.clientX, event.clientY) ?? this.#previewTo;
      this.requestUpdate();
    }
    if (!this.#session) {
      return;
    }
    if (this.#session.kind === "pan") {
      const dx = event.clientX - this.#session.lastX;
      const dy = event.clientY - this.#session.lastY;
      this.#session = { ...this.#session, lastX: event.clientX, lastY: event.clientY };
      this.app.panX += dx;
      this.app.panY += dy;
      return;
    }
    if (this.#session.kind === "move") {
      const dx = event.clientX - this.#session.lastX;
      const dy = event.clientY - this.#session.lastY;
      this.#session = { ...this.#session, lastX: event.clientX, lastY: event.clientY };
      this.app.moveBlock(this.#session.id, dx / this.app.zoom, dy / this.app.zoom);
      return;
    }
    const dist = Math.hypot(event.clientX - this.#session.startX, event.clientY - this.#session.startY);
    if (dist >= LINK_DRAG) {
      this.#session = { ...this.#session, dragged: true };
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    if (!this.app) {
      return;
    }
    if (this.#session && this.#session.pointerId !== event.pointerId) {
      return;
    }
    const hit = portFromComposedPath(event) ?? portFromClientPoint(event.clientX, event.clientY);
    if (this.#session?.kind === "link" || this.app.linkingFrom) {
      if (hit?.side === "in") {
        this.#finishLink(Number(hit.host.dataset.blockId), hit.port);
        return;
      }
      if (this.#session?.kind === "link" && this.#session.dragged) {
        this.app.linkingFrom = null;
        this.#previewTo = null;
      }
      this.#endPointer(event.pointerId);
      this.requestUpdate();
      return;
    }
    this.#endPointer(event.pointerId);
    this.requestUpdate();
  };

  #onViewportPointerDown = (event: PointerEvent): void => {
    if (!isCanvasPointer(event) || this.#session) {
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
      event.preventDefault();
      event.stopPropagation();
      const id = Number(node.dataset.blockId);
      this.app.selectBlock(id);
      this.#session = {
        kind: "move",
        pointerId: event.pointerId,
        id,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      this.#capture(event);
      this.requestUpdate();
      return;
    }
    event.preventDefault();
    if (event.button === 0) {
      this.app.clearSelection();
      this.app.linkingFrom = null;
      this.#previewTo = null;
    }
    this.#session = { kind: "pan", pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    this.#capture(event);
    this.requestUpdate();
  };

  #onHostDragOver = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  };

  #onHostDrop = (event: DragEvent): void => {
    event.preventDefault();
    const defId = this.app.draggingDefId ?? event.dataTransfer?.getData(FLOW_MIME) ?? null;
    this.app.draggingDefId = null;
    if (!defId || !this.app.blockDef(defId)) {
      return;
    }
    const world = this.#toWorld(event.clientX, event.clientY);
    if (!world) {
      return;
    }
    this.app.addBlock(defId, world.x, world.y);
  };

  #onLinkPointerDown(link: Link): void {
    this.app.selectLink(link);
    this.app.linkingFrom = null;
    this.#previewTo = null;
    this.#endPointer();
    this.requestUpdate();
  }

  #onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.#viewportRect();
    if (!rect) {
      return;
    }
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const oldZoom = this.app.zoom;
    const factor = Math.min(1.25, Math.max(0.8, 1 - event.deltaY * 0.0015));
    const newZoom = clampZoom(oldZoom * factor);
    if (Math.abs(newZoom - oldZoom) < 1e-9) {
      return;
    }
    const [panX, panY] = zoomToward(oldZoom, newZoom, cursorX, cursorY, this.app.panX, this.app.panY);
    this.app.zoom = newZoom;
    this.app.panX = panX;
    this.app.panY = panY;
  };

  #connectors() {
    const views: {
      key: string;
      link: Link;
      from: Point;
      to: Point;
      points: Point[];
      crossings: Point[][];
      selected: boolean;
    }[] = [];
    for (const link of this.app.links) {
      const fromBlock = this.app.blocks.find((block) => block.id === link.fromBlock);
      const toBlock = this.app.blocks.find((block) => block.id === link.toBlock);
      const from = worldPort(fromBlock, this.#layouts.get(link.fromBlock), "out", link.fromOut);
      const to = worldPort(toBlock, this.#layouts.get(link.toBlock), "in", link.toIn);
      if (!from || !to) {
        continue;
      }
      const key = linkKey(link.fromBlock, link.fromOut, link.toBlock, link.toIn);
      views.push({
        key,
        link,
        from,
        to,
        points: this.#routes.get(key) ?? [],
        crossings: [],
        selected: this.app.isLinkSelected(link),
      });
    }
    views.forEach((item, index) => {
      item.crossings = jumpoverUnderlays(views, index).map((other) =>
        connectorPolyline(other.from, other.to, other.points),
      );
    });
    return views;
  }

  #previewFrom(): Point | null {
    const linking = this.app.linkingFrom;
    if (!linking) {
      return null;
    }
    const block = this.app.blocks.find((item) => item.id === linking.blockId);
    return worldPort(block, this.#layouts.get(linking.blockId), "out", linking.port) ?? null;
  }

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    const resolved = app.resolveAll();
    const previewFrom = this.#previewFrom();
    const connectors = this.#connectors();
    const grid = GRID_SIZE * app.zoom;
    return html`
      <div
        class=${classMap({
          viewport: true,
          "is-panning": this.#session?.kind === "pan",
          "is-moving-block": this.#session?.kind === "move",
          "is-linking": app.linkingFrom !== null,
          "drop-target": app.draggingDefId !== null,
        })}
        role="application"
        aria-label="Diagram canvas"
        data-testid="diagram-canvas"
        @pointerdown=${this.#onViewportPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerUp}
        @lostpointercapture=${this.#onPointerUp}
      >
        <div
          class="grid"
          style=${styleMap({
            backgroundSize: `${grid}px ${grid}px`,
            backgroundPosition: `${app.panX}px ${app.panY}px`,
          })}
        ></div>
        <div
          class="world"
          style=${styleMap({
            transform: `translate(${app.panX}px, ${app.panY}px) scale(${app.zoom})`,
          })}
        >
          ${repeat(
            connectors,
            (item) => item.key,
            (item) => html`
              <bld-connector
                data-link=${item.key}
                .from=${item.from}
                .to=${item.to}
                .points=${item.points}
                .crossings=${item.crossings}
                .selected=${item.selected}
                .hz=${app.runBusy() ? app.connectorHz(item.link) : 0}
                @linkpointerdown=${() => this.#onLinkPointerDown(item.link)}
              ></bld-connector>
            `,
          )}
          ${previewFrom && this.#previewTo
            ? html`<bld-connector
                .from=${previewFrom}
                .to=${this.#previewTo}
                .crossings=${connectors.map((item) => connectorPolyline(item.from, item.to, item.points))}
                .preview=${true}
              ></bld-connector>`
            : nothing}
          ${repeat(
            app.blocks,
            (block) => block.id,
            (block) => {
              const state = this.#nodeState(block, resolved);
              if (!state) {
                return nothing;
              }
              return html`
                <bld-node
                  .view=${state}
                  .x=${block.x}
                  .y=${block.y}
                  .dragging=${this.#session?.kind === "move" && this.#session.id === block.id}
                  @portpointerdown=${(event: CustomEvent<PortPointerDetail>) => this.#onPortDown(event.detail)}
                  @portpointerup=${(event: CustomEvent<PortPointerDetail>) => this.#onPortUp(event.detail)}
                  @chartclick=${() => app.openOscilloscope(block.id)}
                  @noderesize=${(event: CustomEvent<NodeLayout>) => this.#rememberLayout(block.id, event.detail)}
                ></bld-node>
              `;
            },
          )}
        </div>
        ${app.blocks.length === 0
          ? html`
              <div class="hint">
                <div class="hint-card">
                  <div class="hint-title">Drop blocks here</div>
                  <div class="hint-copy">Drag from the left pane. Click or drag an output handle, then an input.</div>
                </div>
              </div>
            `
          : nothing}
        <div class="toolbar" data-testid="canvas-controls">
          <button
            type="button"
            title="Zoom out"
            data-testid="zoom-out"
            ?disabled=${!app.canZoomOut()}
            @click=${() => app.zoomOut()}
          >
            −
          </button>
          <button type="button" title="Reset view" data-testid="zoom-reset" @click=${() => app.resetView()}>
            ${app.zoomPercent()}%
          </button>
          <button type="button" title="Zoom in" data-testid="zoom-in" @click=${() => app.zoomIn()}>+</button>
        </div>
      </div>
    `;
  }
}

customElements.define("bld-diagram", BldDiagram);

declare global {
  interface HTMLElementTagNameMap {
    "bld-diagram": BldDiagram;
  }
}
