import { LitElement, css, html, nothing } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { renderIconSvg } from "./icons";
import { measureHostLayout, portFromComposedPath } from "./layout";
import type { BldNodeState, NodeLayout, PortPointerDetail, PortSide, PortView } from "./types";

export class BldNode extends LitElement {
  static override properties = {
    view: { attribute: false },
    x: { type: Number },
    y: { type: Number },
    dragging: { type: Boolean, reflect: true, attribute: "data-dragging" },
  };

  declare view: BldNodeState | null;
  declare x: number;
  declare y: number;
  declare dragging: boolean;

  #kindClass = "";
  #resize: ResizeObserver | null = null;

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      position: absolute;
      left: 0;
      top: 0;
      width: max-content;
      min-width: 10rem;
      z-index: 1;
      cursor: grab;
      user-select: none;
      touch-action: none;
      color: var(--bs-body-color, #dee2e6);
      font-size: 12px;
    }
    :host([data-selected]) .flow-node {
      border-color: var(--bs-primary, #0d6efd);
      box-shadow: 0 0 0 1px rgba(13, 110, 253, 0.55);
    }
    :host([data-dragging]) {
      z-index: 4;
      cursor: grabbing;
    }
    :host(.block-kind-start) {
      --block-accent: var(--bs-success, #198754);
    }
    :host(.block-kind-process) {
      --block-accent: var(--bs-primary, #0d6efd);
    }
    :host(.block-kind-decision) {
      --block-accent: var(--bs-warning, #ffc107);
    }
    :host(.block-kind-data) {
      --block-accent: var(--bs-info, #0dcaf0);
    }
    :host(.block-kind-output) {
      --block-accent: var(--bs-danger, #dc3545);
    }
    .flow-node {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 10rem;
      background: #23282d;
      border: 1px solid var(--bs-border-color, #495057);
      border-left: 3px solid var(--block-accent, #0d6efd);
      border-radius: 8px;
    }
    .flow-node-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px 4px;
      flex: 0 0 auto;
    }
    .flow-node-icon {
      color: var(--block-accent, #0d6efd);
      width: 1rem;
      height: 1rem;
      display: inline-flex;
      align-items: center;
      line-height: 1;
      flex: 0 0 auto;
    }
    .flow-node-icon svg {
      width: 1em;
      height: 1em;
      stroke: currentColor;
      stroke-width: 1.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      overflow: visible;
    }
    .flow-node-title {
      font-weight: 650;
      flex: 1 1 auto;
      min-width: 0;
    }
    .flow-node-chart {
      border: 1px solid color-mix(in srgb, var(--bs-info, #0dcaf0) 55%, transparent);
      background: transparent;
      color: var(--bs-info, #0dcaf0);
      border-radius: 4px;
      font-size: 0.65rem;
      padding: 0 5px;
      line-height: 1.4;
      cursor: pointer;
    }
    .flow-node-chart:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .flow-node-params {
      padding: 0 8px 4px;
      color: var(--bs-info, #0dcaf0);
      font-family: var(--bs-font-monospace, ui-monospace, monospace);
      font-size: 0.65rem;
      flex: 0 0 auto;
    }
    .flow-node-ports {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      padding: 2px 6px 8px;
      flex: 1 1 auto;
    }
    .flow-node-port-col {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1 1 0;
      min-width: 0;
    }
    .flow-node-port-col.is-out {
      align-items: flex-end;
    }
    .block-port-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      padding: 0.2rem 0.25rem;
      text-align: left;
      cursor: pointer;
      border-radius: 0.25rem;
    }
    .block-port-row:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .block-port-row.is-out {
      text-align: right;
      justify-content: flex-end;
    }
    .block-port-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.1;
    }
    .block-port-row.is-out .block-port-meta {
      align-items: flex-end;
    }
    .block-port-name {
      font-size: 0.7rem;
      color: var(--bs-secondary-color, #adb5bd);
    }
    .block-port {
      display: inline-block;
      width: 12px;
      height: 12px;
      min-width: 12px;
      min-height: 12px;
      border-radius: 50%;
      border: 2px solid var(--block-accent, #0d6efd);
      background: #14171a;
      flex: 0 0 auto;
    }
    .block-port-row.is-grounded .block-port,
    .block-port-row.is-linking .block-port {
      background: var(--block-accent, #0d6efd);
    }
    .block-port-row.is-linking .block-port {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--block-accent, #0d6efd) 55%, transparent);
    }
    .block-port-row.is-bad .block-port {
      border-color: var(--bs-danger, #dc3545);
    }
  `;

  constructor() {
    super();
    this.view = null;
    this.x = 0;
    this.y = 0;
    this.dragging = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === "function") {
      this.#resize = new ResizeObserver(() => this.#emitLayout());
      this.#resize.observe(this);
    }
  }

  disconnectedCallback(): void {
    this.#resize?.disconnect();
    this.#resize = null;
    super.disconnectedCallback();
  }

  protected override updated(): void {
    this.style.transform = `translate(${this.x}px, ${this.y}px)`;
    const next = this.view;
    if (!next) {
      return;
    }
    this.dataset.blockId = String(next.blockId);
    this.dataset.blockDef = next.defId;
    this.setAttribute("data-testid", "node");
    this.toggleAttribute("data-selected", next.selected);
    this.toggleAttribute("data-dragging", this.dragging);
    this.setAttribute("role", "group");
    this.setAttribute("aria-label", next.name);
    if (this.#kindClass && this.#kindClass !== next.kindClass) {
      this.classList.remove(this.#kindClass);
    }
    this.#kindClass = next.kindClass;
    this.classList.add(next.kindClass);
    this.#emitLayout();
  }

  #emitLayout(): void {
    const layout = measureHostLayout(this);
    this.dispatchEvent(
      new CustomEvent<NodeLayout>("noderesize", {
        bubbles: true,
        composed: true,
        detail: layout,
      }),
    );
  }

  #onPortPointer(event: PointerEvent, phase: "pointerdown" | "pointerup"): void {
    const hit = portFromComposedPath(event);
    if (!hit || hit.host !== this) {
      return;
    }
    event.stopPropagation();
    if (phase === "pointerdown") {
      event.preventDefault();
    }
    const name = phase === "pointerdown" ? "portpointerdown" : "portpointerup";
    this.dispatchEvent(
      new CustomEvent<PortPointerDetail>(name, {
        bubbles: true,
        composed: true,
        detail: {
          blockId: this.view?.blockId ?? Number(this.dataset.blockId),
          port: hit.port,
          side: hit.side,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
        },
      }),
    );
  }

  #onChartClick = (event: MouseEvent): void => {
    event.stopPropagation();
    if (!this.view?.chartEnabled) {
      return;
    }
    this.dispatchEvent(new CustomEvent("chartclick", { bubbles: true, composed: true }));
  };

  #portTestId(side: PortSide, name: string): string {
    return `${side === "in" ? "input" : "output"}-${name}`;
  }

  #portClass(port: PortView, side: PortSide): string {
    return [
      "block-port-row",
      `is-${side}`,
      port.grounded ? "is-grounded" : "",
      port.linking ? "is-linking" : "",
      port.compatible === false ? "is-bad" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  #renderPort(port: PortView, side: PortSide) {
    const handle = html`<span class="block-port" data-handle></span>`;
    const meta = html`
      <span class="block-port-meta">
        <span class="block-port-name">${port.vararg ? `${port.name}…` : port.name}</span>
      </span>
    `;
    return html`
      <button
        class=${this.#portClass(port, side)}
        type="button"
        data-port
        data-side=${side}
        data-name=${port.name}
        data-testid=${this.#portTestId(side, port.name)}
        title=${port.typeLabel}
      >
        ${side === "in" ? handle : meta} ${side === "in" ? meta : handle}
      </button>
    `;
  }

  protected override render() {
    const view = this.view;
    if (!view) {
      return nothing;
    }
    return html`
      <div
        class="flow-node"
        role="group"
        @pointerdown=${(event: PointerEvent) => this.#onPortPointer(event, "pointerdown")}
        @pointerup=${(event: PointerEvent) => this.#onPortPointer(event, "pointerup")}
      >
        <div class="flow-node-header">
          <span class="flow-node-icon" aria-hidden="true">
            ${unsafeSVG(renderIconSvg(view.icon))}
          </span>
          <span class="flow-node-title">${view.name}</span>
          ${view.showChart
            ? html`
                <button
                  class="flow-node-chart"
                  type="button"
                  title=${view.chartEnabled ? "Open live chart" : "Run the diagram to open the chart"}
                  ?disabled=${!view.chartEnabled}
                  data-testid=${`chart-${view.blockId}`}
                  @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
                  @click=${this.#onChartClick}
                >
                  Chart
                </button>
              `
            : nothing}
        </div>
        ${view.paramsLine ? html`<div class="flow-node-params">${view.paramsLine}</div>` : nothing}
        <div class="flow-node-ports">
          <div class="flow-node-port-col">
            ${view.inputs.map((port) => this.#renderPort(port, "in"))}
          </div>
          <div class="flow-node-port-col is-out">
            ${view.outputs.map((port) => this.#renderPort(port, "out"))}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("bld-node", BldNode);

declare global {
  interface HTMLElementTagNameMap {
    "bld-node": BldNode;
  }
}
