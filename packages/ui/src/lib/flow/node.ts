import { LitElement, html, nothing } from "lit";
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
    compact: { type: Boolean, reflect: true, attribute: "data-compact" },
    dragging: { type: Boolean, reflect: true, attribute: "data-dragging" },
  };

  declare view: BldNodeState | null;
  declare x: number;
  declare y: number;
  declare compact: boolean;
  declare dragging: boolean;

  #kindClass = "";
  #resize: ResizeObserver | null = null;

  override createRenderRoot(): HTMLElement {
    return this;
  }

  constructor() {
    super();
    this.view = null;
    this.x = 0;
    this.y = 0;
    this.compact = false;
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
    this.toggleAttribute("data-gpio-on", Boolean(next.showGpio && next.gpioOn));
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

  #onGpioChange = (event: Event): void => {
    event.stopPropagation();
    if (!this.view?.gpioInteractive) {
      return;
    }
    this.dispatchEvent(new CustomEvent("gpioclick", { bubbles: true, composed: true }));
  };

  #onInputsClick = (event: MouseEvent): void => {
    event.stopPropagation();
    if (!this.view?.inputsEnabled) {
      return;
    }
    this.dispatchEvent(new CustomEvent("inputsclick", { bubbles: true, composed: true }));
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
          ${view.showInputs
            ? html`
                <button
                  class="flow-node-config"
                  type="button"
                  title=${view.inputsEnabled ? "Configure inputs" : "Stop the run to configure inputs"}
                  ?disabled=${!view.inputsEnabled}
                  data-testid=${`inputs-${view.blockId}`}
                  @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
                  @click=${this.#onInputsClick}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="8" cy="8" r="2.1"/>
                    <path d="M8 2.4v1.5M8 12.1v1.5M2.4 8h1.5M12.1 8h1.5M4 4l1.1 1.1M10.9 10.9 12 12M4 12l1.1-1.1M10.9 5.1 12 4"/>
                  </svg>
                </button>
              `
            : nothing}
          ${view.showGpio
            ? html`
                <div
                  class="form-check form-switch flow-node-gpio"
                  @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
                >
                  <input
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    id=${`gpio-switch-${view.blockId}`}
                    .checked=${view.gpioOn}
                    ?disabled=${!view.gpioInteractive}
                    aria-label=${`GPIO pin ${view.gpioPin} ${view.gpioOn ? "HIGH" : "LOW"}`}
                    title=${view.gpioInteractive
                      ? `Simulate GPIO pin ${view.gpioPin} in the browser`
                      : `GPIO pin ${view.gpioPin} output`}
                    data-testid=${`gpio-${view.blockId}`}
                    @click=${(event: MouseEvent) => event.stopPropagation()}
                    @change=${this.#onGpioChange}
                  />
                </div>
              `
            : nothing}
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
