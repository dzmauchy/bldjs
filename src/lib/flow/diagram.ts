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
} from "$lib/blocks";
import { AppController } from "$lib/context";
import { GRID_SIZE, clampZoom, zoomToward } from "$lib/model";
import { type AppState, type BlockInstance } from "$lib/state";
import { FLOW_MIME } from "./mime";
import { clientToWorld, linkKey, orthogonalLink, routesEqual, type Point } from "./geometry";
import { AvoidRouteEngine, connectorFromLink, obstacleFromBlock } from "./avoid-router";
import { portFromComposedPath, worldPort } from "./layout";
import type { BldNodeState, NodeLayout, PortPointerDetail } from "./types";
import "./node";
import "./connector";

const LINK_DRAG = 8;

type PointerSession =
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "move"; id: number; lastX: number; lastY: number }
  | { kind: "link"; fromBlock: number; fromPort: string; startX: number; startY: number; dragged: boolean };

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
    window.addEventListener("pointermove", this.#onWinMove);
    window.addEventListener("pointerup", this.#onWinUp);
    window.addEventListener("pointercancel", this.#onWinUp);
    if (typeof ResizeObserver === "function") {
      this.#resize = new ResizeObserver(() => this.#syncHostSize());
      this.#resize.observe(this);
    }
    void this.updateComplete.then(() => this.#syncHostSize());
    void this.#startAvoidRouter();
  }

  disconnectedCallback(): void {
    this.removeEventListener("dragover", this.#onHostDragOver);
    this.removeEventListener("drop", this.#onHostDrop);
    this.removeEventListener("wheel", this.#onWheel);
    window.removeEventListener("pointermove", this.#onWinMove);
    window.removeEventListener("pointerup", this.#onWinUp);
    window.removeEventListener("pointercancel", this.#onWinUp);
    this.#resize?.disconnect();
    this.#resize = null;
    this.#avoid.destroy();
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
    try {
      await this.#avoid.start();
    } catch (error) {
      console.warn("avoid router failed to load", error);
      return;
    }
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
    const next = this.#avoid.sync(obstacles, connectors);
    let changed = this.#routes.size !== next.size;
    if (!changed) {
      for (const [key, points] of next) {
        if (!routesEqual(this.#routes.get(key), points)) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      this.#routes = next;
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
      inputs: def.inputs.map((port) => ({
        name: port.name,
        typeLabel: typeToString(resolvedBlock ? (resolvedInput(resolvedBlock, port.name) ?? port.ty) : port.ty),
        vararg: port.vararg,
        grounded: this.app.inputIsGrounded(block.id, port.name),
        compatible: resolvedBlock ? isResolvedCompatible(resolvedBlock, port.name) : true,
      })),
      outputs: def.outputs.map((port) => ({
        name: port.name,
        typeLabel: typeToString(resolvedBlock ? (resolvedOutput(resolvedBlock, port.name) ?? port.ty) : port.ty),
        vararg: port.vararg,
        linking: this.app.linkingFrom?.blockId === block.id && this.app.linkingFrom.port === port.name,
      })),
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
    this.#session = null;
    this.requestUpdate();
  }

  #onPortDown(detail: PortPointerDetail): void {
    if (detail.side === "out") {
      this.app.linkingFrom = { blockId: detail.blockId, port: detail.port };
      this.#previewTo = this.#toWorld(detail.clientX, detail.clientY) ?? null;
      this.#session = {
        kind: "link",
        fromBlock: detail.blockId,
        fromPort: detail.port,
        startX: detail.clientX,
        startY: detail.clientY,
        dragged: false,
      };
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

  #onWinMove = (event: PointerEvent): void => {
    if (!this.app) {
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

  #onWinUp = (event: PointerEvent): void => {
    if (!this.app) {
      return;
    }
    const hit = portFromComposedPath(event);
    if (this.#session?.kind === "link" || this.app.linkingFrom) {
      if (hit?.side === "in") {
        this.#finishLink(Number(hit.host.dataset.blockId), hit.port);
        return;
      }
      if (this.#session?.kind === "link" && this.#session.dragged) {
        this.app.linkingFrom = null;
        this.#previewTo = null;
      }
      this.#session = null;
      this.requestUpdate();
      return;
    }
    this.#session = null;
    this.requestUpdate();
  };

  #onViewportPointerDown = (event: PointerEvent): void => {
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
      this.app.selectBlock(id);
      this.#session = { kind: "move", id, lastX: event.clientX, lastY: event.clientY };
      this.requestUpdate();
      return;
    }
    if (event.button === 0) {
      this.app.clearSelection();
      this.app.linkingFrom = null;
      this.#previewTo = null;
    }
    this.#session = { kind: "pan", lastX: event.clientX, lastY: event.clientY };
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
    this.#session = null;
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
    const views: { key: string; link: Link; from: Point; to: Point; points: Point[]; selected: boolean }[] = [];
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
        points: this.#routes.get(key) ?? orthogonalLink(from, to),
        selected: this.app.isLinkSelected(link),
      });
    }
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
            this.#connectors(),
            (item) => item.key,
            (item) => html`
              <bld-connector
                data-link=${item.key}
                .from=${item.from}
                .to=${item.to}
                .points=${item.points}
                .selected=${item.selected}
                @linkpointerdown=${() => this.#onLinkPointerDown(item.link)}
              ></bld-connector>
            `,
          )}
          ${previewFrom && this.#previewTo
            ? html`<bld-connector .from=${previewFrom} .to=${this.#previewTo} .preview=${true}></bld-connector>`
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
