import { LitElement, css, html, nothing } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { renderIconSvg } from "./icons";
import { measureHostLayout, portFromComposedPath } from "./layout";
import { groupPortViews, type PortGroup } from "./port-groups";
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
      --port-size: 12px;
      --port-outset: calc(var(--port-size) / 2 - 1px);
      --port-stub: 2px;
      --port-rail: 2px;
      display: flex;
      flex-direction: column;
      position: absolute;
      left: 0;
      top: 0;
      width: max-content;
      min-width: 5.5rem;
      overflow: visible;
      z-index: 1;
      cursor: grab;
      user-select: none;
      touch-action: none;
      color: var(--bs-body-color, #dee2e6);
      font-size: 12px;
    }
    @keyframes node-selected-fade {
      0%,
      100% {
        background-color: #23282d;
      }
      50% {
        background-color: #14191e;
      }
    }
    :host([data-selected]) .flow-node {
      animation: node-selected-fade 1.8s ease-in-out infinite;
    }
    :host([data-dragging]) {
      z-index: 4;
      cursor: grabbing;
    }
    :host(:hover) {
      z-index: 3;
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
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      flex: 1 1 auto;
      min-width: 5.5rem;
      min-height: 4.5rem;
      overflow: visible;
      background-color: #23282d;
      border: 1px solid var(--bs-border-color, #495057);
      border-radius: 8px;
      box-shadow: inset 3px 0 0 var(--block-accent, #0d6efd);
    }
    .flow-node-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 10px 8px;
      min-width: 32px;
    }
    .flow-node-title {
      font-size: 0.6rem;
      line-height: 1.15;
      text-align: center;
      max-width: 7rem;
      color: var(--bs-secondary-color, #adb5bd);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .flow-node-icon {
      color: var(--block-accent, #0d6efd);
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      flex: 0 0 32px;
    }
    .flow-node-icon svg {
      width: 32px;
      height: 32px;
      stroke: currentColor;
      stroke-width: 1.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      overflow: visible;
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
      color: var(--bs-info, #0dcaf0);
      font-family: var(--bs-font-monospace, ui-monospace, monospace);
      font-size: 0.65rem;
      text-align: center;
      max-width: 7rem;
    }
    .flow-node-port-col {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      min-width: 0;
      padding: 8px 0;
    }
    .flow-node-port-col.is-in {
      justify-self: start;
      align-items: flex-start;
    }
    .flow-node-port-col.is-out {
      justify-self: end;
      align-items: flex-end;
    }
    .block-port-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      border: 0;
      background: transparent;
      color: inherit;
      padding: 0;
      text-align: left;
      cursor: pointer;
      position: relative;
    }
    .block-port-row.is-in {
      justify-content: flex-start;
    }
    .block-port-row.is-out {
      text-align: right;
      justify-content: flex-end;
      flex-direction: row-reverse;
    }
    .block-port-row.is-vector {
      width: var(--port-size);
      height: var(--port-size);
      overflow: visible;
    }
    .block-port-row.is-vector.is-in {
      margin-left: calc(-1 * var(--port-outset));
    }
    .block-port-row.is-vector.is-out {
      margin-right: calc(-1 * var(--port-outset));
    }
    .block-port-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.1;
      padding-inline: 4px;
    }
    .block-port-row.is-out .block-port-meta,
    .block-port-vector.is-out .block-port-meta {
      align-items: flex-end;
    }
    .block-port-name {
      font-size: 0.7rem;
      color: var(--bs-secondary-color, #adb5bd);
    }
    .block-port-anchor {
      position: relative;
      display: inline-flex;
      width: var(--port-size);
      height: var(--port-size);
      flex: 0 0 var(--port-size);
    }
    .block-port-row.is-in:not(.is-vector) .block-port-anchor {
      left: calc(-1 * var(--port-outset));
      margin-right: calc(-1 * var(--port-outset));
    }
    .block-port-row.is-out:not(.is-vector) .block-port-anchor {
      left: var(--port-outset);
      margin-left: calc(-1 * var(--port-outset));
    }
    .block-port-type {
      position: absolute;
      top: calc(100% + 2px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 6;
      pointer-events: none;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(20, 23, 26, 0.72);
      font-size: 0.62rem;
      line-height: 1.2;
      color: var(--bs-info, #0dcaf0);
      font-family: var(--bs-font-monospace, ui-monospace, monospace);
      white-space: nowrap;
    }
    .block-port {
      box-sizing: border-box;
      display: inline-block;
      width: var(--port-size);
      height: var(--port-size);
      min-width: var(--port-size);
      min-height: var(--port-size);
      border-radius: 50%;
      border: 2px solid var(--block-accent, #0d6efd);
      background: #14171a;
      flex: 0 0 var(--port-size);
      position: relative;
    }
    .block-port-row.is-grounded .block-port,
    .block-port-row.is-linking .block-port {
      background: var(--block-accent, #0d6efd);
    }
    .block-port-row.is-linking .block-port {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--block-accent, #0d6efd) 55%, transparent);
    }
    .block-port-row.is-bad .block-port-type {
      color: var(--bs-danger, #dc3545);
    }
    .block-port-row.is-bad .block-port {
      border-color: var(--bs-danger, #dc3545);
    }
    .block-port-vector {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .block-port-vector.is-in {
      flex-direction: row;
    }
    .block-port-vector.is-out {
      flex-direction: row-reverse;
    }
    .block-port-vector-pins {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
    }
    .block-port-vector-rail {
      width: var(--port-rail);
      align-self: stretch;
      margin-block: 2px;
      background: var(--block-accent, #0d6efd);
      border-radius: 1px;
      flex: 0 0 var(--port-rail);
    }
    .block-port-vector.is-in .block-port-vector-rail {
      margin-left: var(--port-stub);
    }
    .block-port-vector.is-out .block-port-vector-rail {
      margin-right: var(--port-stub);
    }
    .block-port-row.is-vector.is-in .block-port::after,
    .block-port-row.is-vector.is-out .block-port::before {
      content: "";
      position: absolute;
      top: 50%;
      width: var(--port-stub);
      height: var(--port-stub);
      background: var(--block-accent, #0d6efd);
      transform: translateY(-50%);
    }
    .block-port-row.is-vector.is-in .block-port::after {
      left: 100%;
    }
    .block-port-row.is-vector.is-out .block-port::before {
      right: 100%;
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

  #portClass(port: PortView, side: PortSide, vectorized = false): string {
    return [
      "block-port-row",
      `is-${side}`,
      vectorized ? "is-vector" : "",
      port.grounded ? "is-grounded" : "",
      port.linking ? "is-linking" : "",
      port.compatible === false ? "is-bad" : "",
      port.showType ? "is-typed" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  #renderHandle(typeLabel?: string, typeTestId?: string) {
    return html`
      <span class="block-port-anchor">
        <span class="block-port" data-handle></span>
        ${typeLabel && typeTestId
          ? html`<span class="block-port-type" data-testid=${typeTestId}>${typeLabel}</span>`
          : nothing}
      </span>
    `;
  }

  #renderMeta(label: string | undefined) {
    if (!label) {
      return nothing;
    }
    return html`
      <span class="block-port-meta">
        <span class="block-port-name">${label}</span>
      </span>
    `;
  }

  #typedSlot(group: PortGroup): PortView | undefined {
    return group.ports.find((port) => port.showType);
  }

  #renderPin(port: PortView, side: PortSide, vectorized: boolean, typeLabel?: string, typeTestId?: string) {
    return html`
      <button
        class=${this.#portClass(port, side, vectorized)}
        type="button"
        data-port
        data-side=${side}
        data-name=${port.name}
        data-testid=${this.#portTestId(side, port.name)}
        title=${port.typeLabel}
      >
        ${this.#renderHandle(typeLabel, typeTestId)}
      </button>
    `;
  }

  #renderGroup(group: PortGroup, side: PortSide, showName: boolean) {
    const typed = this.#typedSlot(group);
    const typeTestId = typed ? `${this.#portTestId(side, group.catalogName)}-type` : undefined;
    const meta = this.#renderMeta(showName ? group.label : undefined);
    if (!group.vectorized) {
      const port = group.ports[0];
      if (!port) {
        return nothing;
      }
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
          ${this.#renderHandle(typed?.typeLabel, typeTestId)} ${meta}
        </button>
      `;
    }
    return html`
      <div class="block-port-vector is-${side}" data-vector=${group.catalogName}>
        <div class="block-port-vector-pins">
          ${group.ports.map((port) =>
            this.#renderPin(
              port,
              side,
              true,
              port.showType ? port.typeLabel : undefined,
              port.showType ? typeTestId : undefined,
            ),
          )}
        </div>
        <span class="block-port-vector-rail" aria-hidden="true"></span>
        ${meta}
      </div>
    `;
  }

  protected override render() {
    const view = this.view;
    if (!view) {
      return nothing;
    }
    const inputs = groupPortViews(view.inputs);
    const outputs = groupPortViews(view.outputs);
    return html`
      <div
        class="flow-node"
        role="group"
        title=${view.name}
        @pointerdown=${(event: PointerEvent) => this.#onPortPointer(event, "pointerdown")}
        @pointerup=${(event: PointerEvent) => this.#onPortPointer(event, "pointerup")}
      >
        <div class="flow-node-port-col is-in flow-node-ports">
          ${inputs.map((group) => this.#renderGroup(group, "in", inputs.length > 1))}
        </div>
        <div class="flow-node-body">
          <span class="flow-node-title">${view.name}</span>
          <span class="flow-node-icon" aria-hidden="true">
            ${unsafeSVG(renderIconSvg(view.icon))}
          </span>
          ${view.paramsLine ? html`<div class="flow-node-params">${view.paramsLine}</div>` : nothing}
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
        <div class="flow-node-port-col is-out flow-node-ports">
          ${outputs.map((group) => this.#renderGroup(group, "out", outputs.length > 1))}
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
