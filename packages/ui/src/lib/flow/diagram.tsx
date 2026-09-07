import { createEffect, createSignal, For, Show, type JSX } from "solid-js";
import { GRID_SIZE, blockOriginFromDrop, wheelZoomFactor } from "$lib/model";
import { AppHost } from "$lib/ui/app-host";
import { FLOW_MIME, PALETTE_DROP_EVENT, type PaletteDropDetail } from "./mime";
import { clientToWorld, type Point } from "./geometry";
import { AvoidRouteEngine } from "./avoid-router";
import { DiagramInteractionController } from "./interaction";
import { DiagramLayoutController } from "./layout-controller";
import { buildConnectorViews, buildNodeState, linkPushes, previewFromPort } from "./views";
import type { NodeLayout, PortPointerDetail } from "./types";
import "./node";
import { BldConnector } from "./connector";

export class BldDiagram extends AppHost {
  #interaction: DiagramInteractionController;
  #layout = new DiagramLayoutController();
  #resize: ResizeObserver | null = null;
  #avoid = new AvoidRouteEngine();
  readonly #routes = createSignal(new Map<string, Point[]>());
  readonly #interactionRev = createSignal(0);
  readonly #layoutRev = createSignal(0);
  #flowTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.#interaction = new DiagramInteractionController({
      get app() { return diagram.app; },
      toWorld: (x, y) => diagram.#toWorld(x, y),
      viewportElement: () => diagram.#viewportEl(),
      requestUpdate: () => diagram.#interactionRev[1]((r) => r + 1),
    });
    const diagram = this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
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

  override disconnectedCallback(): void {
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

  async #startAvoidRouter(): Promise<void> {
    this.#avoid.onRoutesChanged(() => this.#routes[1](new Map(this.#avoid.routes)));
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
  }

  #syncRoutes(): void {
    if (!this.app || !this.#avoid.ready) return;
    const { obstacles, connectors } = this.#layout.routePayload(this.app.blocks, this.app.links);
    this.#avoid.sync(obstacles, connectors);
  }

  #syncFlowRates(): void {
    const app = this.app;
    if (!app) return;
    if (app.run.running) app.run.sampleFlowRates();
    const busy = app.run.busy();
    for (const host of this.querySelectorAll<BldConnector>("bld-connector")) {
      if (host.preview) continue;
      const key = host.getAttribute("data-link");
      host.hz = key && busy ? app.run.connectorHzForKey(key) : 0;
    }
  }

  #viewportEl(): HTMLDivElement | null {
    return this.querySelector(".viewport");
  }

  #viewportRect(): DOMRect | undefined {
    return this.#viewportEl()?.getBoundingClientRect() ?? this.getBoundingClientRect();
  }

  #toWorld(clientX: number, clientY: number): Point | undefined {
    const rect = this.#viewportRect();
    if (!rect) return undefined;
    return clientToWorld(clientX, clientY, rect, this.app.panX, this.app.panY, this.app.zoom);
  }

  #syncHostSize(): void {
    if (!this.app) return;
    if (this.offsetWidth > 0) this.app.viewportW = this.offsetWidth;
    if (this.offsetHeight > 0) this.app.viewportH = this.offsetHeight;
  }

  #rememberLayout(blockId: number, layout: NodeLayout): void {
    if (this.#layout.remember(blockId, layout)) {
      this.#layoutRev[1]((r) => r + 1);
      this.#syncRoutes();
    }
  }

  #onHostDragOver = (e: DragEvent): void => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  };

  #handleDrop(defId: string | null, clientX: number, clientY: number): void {
    this.app.draggingDefId = null;
    if (this.app.compactUi) this.app.closePalette();
    this.#placeBlock(defId, clientX, clientY);
  }

  #onHostDrop = (e: DragEvent): void => {
    e.preventDefault();
    this.#handleDrop(this.app.draggingDefId ?? e.dataTransfer?.getData(FLOW_MIME) ?? null, e.clientX, e.clientY);
  };

  #onPaletteDrop = (e: Event): void => {
    const detail = (e as CustomEvent<PaletteDropDetail>).detail;
    if (detail?.defId) this.#handleDrop(detail.defId, detail.clientX, detail.clientY);
  };

  #placeBlock(defId: string | null, clientX: number, clientY: number): void {
    if (!defId || !this.app.blockDef(defId)) return;
    const rect = this.#viewportRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    const world = this.#toWorld(clientX, clientY);
    if (!world) return;
    const origin = blockOriginFromDrop(world.x, world.y);
    this.app.addBlock(defId, origin.x, origin.y);
  }

  #onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.#viewportRect();
    if (rect) this.app.zoomBy(wheelZoomFactor(e.deltaY), e.clientX - rect.left, e.clientY - rect.top);
  };

  override render(): JSX.Element {
    const app = this.reactiveApp;

    createEffect(() => {
      app.blocks.length;
      app.links.length;
      this.#syncRoutes();
    });

    const session = () => {
      this.#interactionRev[0]();
      return this.#interaction.session;
    };
    const resolved = () => app.resolveAll();
    const previewTo = () => {
      this.#interactionRev[0]();
      return this.#interaction.previewTo;
    };
    const previewFrom = () => {
      this.#layoutRev[0]();
      return previewFromPort(app.linkingFrom, (id) => app.block(id), this.#layout.layouts);
    };
    const connectors = () => {
      this.#layoutRev[0]();
      return buildConnectorViews(
        app.links,
        (id) => app.block(id),
        this.#layout.layouts,
        this.#routes[0](),
        (link) => app.isLinkSelected(link),
      );
    };
    const grid = () => GRID_SIZE * app.zoom;

    return (
      <div
        class={`viewport${session()?.kind === "pan" ? " is-panning" : ""}${session()?.kind === "move" ? " is-moving-block" : ""}${app.linkingFrom !== null ? " is-linking" : ""}${app.draggingDefId !== null ? " drop-target" : ""}`}
        role="application"
        aria-label="Diagram canvas"
        data-testid="diagram-canvas"
        onPointerDown={(e: PointerEvent) => this.#interaction.onViewportPointerDown(e)}
      >
        <div
          class="grid"
          style={{
            "background-size": `${grid()}px ${grid()}px`,
            "background-position": `${app.panX}px ${app.panY}px`,
          }}
        ></div>
        <div
          class="world"
          style={{
            transform: `translate(${app.panX}px, ${app.panY}px) scale(${app.zoom})`,
          }}
        >
          <div class="diagram-connectors">
            <For each={connectors()}>
              {(item) => (
                <bld-connector
                  attr:data-link={item.key}
                  data-link={item.key}
                  attr:data-testid="connector"
                  prop:from={item.from}
                  prop:to={item.to}
                  prop:points={item.points}
                  prop:crossings={item.crossings}
                  prop:selected={item.selected}
                  prop:push={linkPushes(resolved(), item.link)}
                  prop:hz={app.run.busy() ? app.run.connectorHz(item.link) : 0}
                  on:linkpointerdown={() => this.#interaction.onLinkPointerDown(item.link)}
                ></bld-connector>
              )}
            </For>
            <Show when={Boolean(previewFrom() && previewTo())}>
              <bld-connector
                attr:data-testid="connector-preview"
                attr:data-preview=""
                prop:from={previewFrom()!}
                prop:to={previewTo()!}
                prop:crossings={connectors().map((item) => ({
                  from: item.from,
                  to: item.to,
                  route: item.points,
                }))}
                prop:preview={true}
              ></bld-connector>
            </Show>
          </div>
          <div class="diagram-nodes">
            <For each={app.blocks}>
              {(block) => (
                <bld-node
                  attr:data-block-def={block.defId}
                  attr:data-block-id={block.id}
                  prop:view={buildNodeState(block, resolved(), {
                    catalog: app.catalog,
                    links: app.links,
                    selected: app.selected,
                    linkingFrom: app.linkingFrom,
                    isScopeLive: (id) => app.run.isScopeLive(id),
                    gpioOn: (id) => app.gpioOn(id),
                    gpioPin: (id) => app.blockPin(id),
                    inputsEnabled: !app.run.busy(),
                    inputIsGrounded: (blockId, port) => app.inputIsGrounded(blockId, port),
                    blockDef: (defId) => app.blockDef(defId),
                    kindOf: (def) => app.kindOf(def),
                    outputCount: (id) => app.blockCount(id) ?? 1,
                  })}
                  prop:x={block.x}
                  prop:y={block.y}
                  prop:compact={app.compactUi}
                  prop:dragging={Boolean(session()?.kind === "move" && (session() as any).id === block.id)}
                  on:portpointerdown={(e: CustomEvent<PortPointerDetail>) => this.#interaction.onPortDown(e.detail)}
                  on:portpointerup={(e: CustomEvent<PortPointerDetail>) => this.#interaction.onPortUp(e.detail)}
                  on:chartclick={() => app.openScope(block.id)}
                  on:gpioclick={() => app.toggleGpio(block.id)}
                  on:inputsclick={() => app.openInputs(block.id)}
                  on:noderesize={(e: CustomEvent<NodeLayout>) => this.#rememberLayout(block.id, e.detail)}
                ></bld-node>
              )}
            </For>
          </div>
        </div>
        <Show when={app.blocks.length === 0}>
          <div class="hint">
            <div class="hint-card">
              <div class="hint-title">Drop blocks here</div>
              <div class="hint-copy">
                {app.compactUi
                  ? "Tap Blocks, then drag a block onto the canvas."
                  : "Drag from the left pane. Click or drag an output handle, then an input."}
              </div>
            </div>
          </div>
        </Show>
        <div class="toolbar" data-testid="canvas-controls">
          <button
            type="button"
            title="Zoom out"
            data-testid="zoom-out"
            disabled={!app.canZoomOut()}
            onClick={() => app.zoomOut()}
          >
            −
          </button>
          <button type="button" title="Reset view" data-testid="zoom-reset" onClick={() => app.resetView()}>
            {app.zoomPercent()}%
          </button>
          <button type="button" title="Zoom in" data-testid="zoom-in" onClick={() => app.zoomIn()}>
            +
          </button>
        </div>
      </div>
    );
  }
}

customElements.define("bld-diagram", BldDiagram);

declare global {
  interface HTMLElementTagNameMap {
    "bld-diagram": BldDiagram;
  }
}
