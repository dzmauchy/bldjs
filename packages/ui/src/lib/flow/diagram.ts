import { LitElement, css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { AppController } from "$lib/context";
import { GRID_SIZE, blockOriginFromDrop, wheelZoomFactor } from "$lib/model";
import { type AppState } from "$lib/state";
import { FLOW_MIME, PALETTE_DROP_EVENT, type PaletteDropDetail } from "./mime";
import { clientToWorld, type Point } from "./geometry";
import { AvoidRouteEngine } from "./avoid-router";
import { DiagramInteractionController } from "./interaction";
import { DiagramLayoutController } from "./layout-controller";
import { buildConnectorViews, buildNodeState, linkPushes, previewFromPort } from "./views";
import type { NodeLayout, PortPointerDetail } from "./types";
import "./node";
import { BldConnector } from "./connector";

export class BldDiagram extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;
  #interaction: DiagramInteractionController;
  #layout = new DiagramLayoutController();
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
    :host([data-compact]) .hint-card {
      padding: 0.7rem 0.9rem;
      max-width: 220px;
    }
    :host([data-compact]) .hint-title {
      font-size: 0.85rem;
    }
    :host([data-compact]) .hint-copy {
      font-size: 0.75rem;
    }
    :host([data-compact]) .toolbar {
      right: 8px;
      bottom: 8px;
    }
    :host([data-compact]) .toolbar button {
      padding: 0.18rem 0.42rem;
      font-size: 0.8rem;
    }
  `;

  constructor() {
    super();
    this.app = undefined as unknown as AppState;
    const diagram = this;
    this.#interaction = new DiagramInteractionController({
      get app() {
        return diagram.app;
      },
      toWorld: (clientX, clientY) => diagram.#toWorld(clientX, clientY),
      viewportElement: () => diagram.#viewportEl(),
      requestUpdate: () => diagram.requestUpdate(),
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#bindApp();
    this.#syncHostSize();
    this.addEventListener("dragover", this.#onHostDragOver);
    this.addEventListener("drop", this.#onHostDrop);
    this.addEventListener("wheel", this.#onWheel, { passive: false });
    window.addEventListener(PALETTE_DROP_EVENT, this.#onPaletteDrop);
    if (typeof ResizeObserver === "function") {
      this.#resize = new ResizeObserver(() => this.#syncHostSize());
      this.#resize.observe(this);
    }
    void this.updateComplete.then(() => this.#syncHostSize());
    void this.#startAvoidRouter();
    this.#flowTimer = setInterval(() => this.#syncFlowRates(), 100);
  }

  disconnectedCallback(): void {
    this.#interaction.dispose();
    this.removeEventListener("dragover", this.#onHostDragOver);
    this.removeEventListener("drop", this.#onHostDrop);
    this.removeEventListener("wheel", this.#onWheel);
    window.removeEventListener(PALETTE_DROP_EVENT, this.#onPaletteDrop);
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

  protected override updated(): void {
    this.toggleAttribute("data-compact", this.app?.compactUi ?? false);
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
    this.dataset.connector = "jumpover";
    this.#syncRoutes();
    this.requestUpdate();
  }

  #syncRoutes(): void {
    if (!this.app || !this.#avoid.ready) {
      return;
    }
    const { obstacles, connectors } = this.#layout.routePayload(this.app.blocks, this.app.links);
    this.#avoid.sync(obstacles, connectors);
  }

  #syncFlowRates(): void {
    if (!this.app) {
      return;
    }
    if (this.app.run.running) {
      this.app.run.sampleFlowRates();
    }
    for (const host of this.renderRoot.querySelectorAll("bld-connector")) {
      if (!(host instanceof BldConnector) || host.preview) {
        continue;
      }
      const key = host.getAttribute("data-link");
      host.hz = key && this.app.run.busy() ? this.app.run.connectorHzForKey(key) : 0;
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

  #syncHostSize(): void {
    if (!this.app) {
      return;
    }
    const width = this.offsetWidth;
    const height = this.offsetHeight;
    if (width > 0) {
      this.app.viewportW = width;
    }
    if (height > 0) {
      this.app.viewportH = height;
    }
  }

  #rememberLayout(blockId: number, layout: NodeLayout): void {
    if (this.#layout.remember(blockId, layout)) {
      this.requestUpdate();
    }
  }

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
    if (this.app.compactUi) {
      this.app.closePalette();
    }
    this.#placeBlock(defId, event.clientX, event.clientY);
  };

  #onPaletteDrop = (event: Event): void => {
    const detail = (event as CustomEvent<PaletteDropDetail>).detail;
    if (!detail?.defId) {
      return;
    }
    this.app.draggingDefId = null;
    if (this.app.compactUi) {
      this.app.closePalette();
    }
    this.#placeBlock(detail.defId, detail.clientX, detail.clientY);
  };

  #placeBlock(defId: string | null, clientX: number, clientY: number): void {
    if (!defId || !this.app.blockDef(defId)) {
      return;
    }
    const rect = this.#viewportRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return;
    }
    const world = this.#toWorld(clientX, clientY);
    if (!world) {
      return;
    }
    const origin = blockOriginFromDrop(world.x, world.y);
    this.app.addBlock(defId, origin.x, origin.y);
  }

  #onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.#viewportRect();
    if (!rect) {
      return;
    }
    this.app.zoomBy(wheelZoomFactor(event.deltaY), event.clientX - rect.left, event.clientY - rect.top);
  };

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    const session = this.#interaction.session;
    const resolved = app.resolveAll();
    const previewFrom = previewFromPort(
      app.linkingFrom,
      (id) => app.block(id),
      this.#layout.layouts,
    );
    const connectors = buildConnectorViews(
      app.links,
      (id) => app.block(id),
      this.#layout.layouts,
      this.#routes,
      (link) => app.isLinkSelected(link),
    );
    const grid = GRID_SIZE * app.zoom;
    return html`
      <div
        class=${classMap({
          viewport: true,
          "is-panning": session?.kind === "pan",
          "is-moving-block": session?.kind === "move",
          "is-linking": app.linkingFrom !== null,
          "drop-target": app.draggingDefId !== null,
        })}
        role="application"
        aria-label="Diagram canvas"
        data-testid="diagram-canvas"
        @pointerdown=${(event: PointerEvent) => this.#interaction.onViewportPointerDown(event)}
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
                .push=${linkPushes(resolved, item.link)}
                .hz=${app.run.busy() ? app.run.connectorHz(item.link) : 0}
                @linkpointerdown=${() => this.#interaction.onLinkPointerDown(item.link)}
              ></bld-connector>
            `,
          )}
          ${previewFrom && this.#interaction.previewTo
            ? html`<bld-connector
                .from=${previewFrom}
                .to=${this.#interaction.previewTo}
                .crossings=${connectors.map((item) => ({
                  from: item.from,
                  to: item.to,
                  route: item.points,
                }))}
                .preview=${true}
              ></bld-connector>`
            : nothing}
          ${repeat(
            app.blocks,
            (block) => block.id,
            (block) => {
              const state = buildNodeState(block, resolved, {
                catalog: app.catalog,
                links: app.links,
                selected: app.selected,
                linkingFrom: app.linkingFrom,
                isScopeLive: (id) => app.run.isScopeLive(id),
                inputIsGrounded: (blockId, port) => app.inputIsGrounded(blockId, port),
                blockDef: (defId) => app.blockDef(defId),
                kindOf: (def) => app.kindOf(def),
              });
              if (!state) {
                return nothing;
              }
              return html`
                <bld-node
                  .view=${state}
                  .x=${block.x}
                  .y=${block.y}
                  .compact=${app.compactUi}
                  .dragging=${session?.kind === "move" && session.id === block.id}
                  @portpointerdown=${(event: CustomEvent<PortPointerDetail>) =>
                    this.#interaction.onPortDown(event.detail)}
                  @portpointerup=${(event: CustomEvent<PortPointerDetail>) =>
                    this.#interaction.onPortUp(event.detail)}
                  @chartclick=${() => app.openScope(block.id)}
                  @inputsclick=${() => app.openInputs(block.id)}
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
                  <div class="hint-copy">
                    ${app.compactUi
                      ? "Tap Blocks, then drag a block onto the canvas."
                      : "Drag from the left pane. Click or drag an output handle, then an input."}
                  </div>
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
