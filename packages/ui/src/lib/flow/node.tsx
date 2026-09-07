import { createEffect, Index, type JSX } from "solid-js";
import { defineElementProps, SolidElement } from "$lib/ui/app-host";
import { renderIconSvg } from "./icons";
import { measureHostLayout, portFromComposedPath } from "./layout";
import { groupPortViews, type PortGroup } from "./port-groups";
import type { BldNodeState, NodeLayout, PortPointerDetail, PortSide, PortView } from "./types";

export class BldNode extends SolidElement {
  declare view: BldNodeState | null;
  declare x: number;
  declare y: number;
  declare compact: boolean;
  declare dragging: boolean;

  #kindClass = "";
  #resize: ResizeObserver | null = null;

  constructor() {
    super();
    defineElementProps(this, {
      view: null as BldNodeState | null,
      x: 0,
      y: 0,
      compact: false,
      dragging: false,
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === "function") {
      this.#resize = new ResizeObserver(() => this.#emitLayout());
      this.#resize.observe(this);
    }
  }

  override disconnectedCallback(): void {
    this.#resize?.disconnect();
    this.#resize = null;
    super.disconnectedCallback();
  }

  #emitLayout(): void {
    this.dispatchEvent(
      new CustomEvent<NodeLayout>("noderesize", {
        bubbles: true,
        composed: true,
        detail: measureHostLayout(this),
      }),
    );
  }

  #dispatch(name: string): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  #onPortPointer(event: PointerEvent, phase: "pointerdown" | "pointerup"): void {
    const hit = portFromComposedPath(event);
    if (!hit || hit.host !== this) return;
    event.stopPropagation();
    if (phase === "pointerdown") event.preventDefault();
    this.dispatchEvent(
      new CustomEvent<PortPointerDetail>(phase === "pointerdown" ? "portpointerdown" : "portpointerup", {
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

  #portTestId(side: PortSide, name: string): string {
    return `${side === "in" ? "input" : "output"}-${name}`;
  }

  #portClass(port: PortView, side: PortSide, vectorized = false): string {
    return [
      "block-port-row",
      `is-${side}`,
      vectorized && "is-vector",
      port.grounded && "is-grounded",
      port.linking && "is-linking",
      port.compatible === false && "is-bad",
      port.showType && "is-typed",
    ].filter(Boolean).join(" ");
  }

  #renderPin(port: () => PortView, side: PortSide, vectorized: boolean): JSX.Element {
    const showType = () => port().showType;
    const typeTestId = () => `${this.#portTestId(side, port().name)}-type`;
    return (
      <button
        class={this.#portClass(port(), side, vectorized)}
        type="button"
        data-port
        data-side={side}
        data-name={port().name}
        data-testid={this.#portTestId(side, port().name)}
        title={port().typeLabel}
      >
        <span class="block-port-anchor">
          <span class="block-port" data-handle></span>
          {showType() && <span class="block-port-type" data-testid={typeTestId()}>{port().typeLabel}</span>}
        </span>
      </button>
    );
  }

  #renderGroup(group: () => PortGroup, side: PortSide, showName: boolean): JSX.Element {
    const typed = () => group().ports.find((port) => port.showType);
    const typeTestId = () => typed() ? `${this.#portTestId(side, group().catalogName)}-type` : undefined;
    const meta = () => showName && group().label && (
      <span class="block-port-meta"><span class="block-port-name">{group().label}</span></span>
    );
    return (
      <>
        {!group().vectorized ? (
          <button
            class={group().ports[0] ? this.#portClass(group().ports[0], side) : ""}
            type="button"
            data-port
            data-side={side}
            data-name={group().ports[0]?.name}
            data-testid={group().ports[0] ? this.#portTestId(side, group().ports[0].name) : undefined}
            title={group().ports[0]?.typeLabel}
          >
            <span class="block-port-anchor">
              <span class="block-port" data-handle></span>
              {typed() && <span class="block-port-type" data-testid={typeTestId()}>{typed()!.typeLabel}</span>}
            </span>
            {meta()}
          </button>
        ) : (
          <div class={`block-port-vector is-${side}`} data-vector={group().catalogName}>
            <div class="block-port-vector-pins">
              <Index each={group().ports}>
                {(port) => this.#renderPin(port, side, true)}
              </Index>
            </div>
            <span class="block-port-vector-rail" aria-hidden="true"></span>
            {meta()}
          </div>
        )}
      </>
    );
  }

  override render(): JSX.Element {
    createEffect(() => {
      this.style.transform = `translate(${this.x}px, ${this.y}px)`;
      this.toggleAttribute("data-compact", this.compact);
      this.toggleAttribute("data-dragging", this.dragging);
    });

    createEffect(() => {
      const next = this.view;
      if (!next) return;
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
    });

    const v = () => this.view;
    const inGroups = () => groupPortViews(v()?.inputs ?? []);
    const outGroups = () => groupPortViews(v()?.outputs ?? []);

    return (
      <div
        class="flow-node"
        role="group"
        title={v()?.name}
        on:pointerdown={(e: PointerEvent) => this.#onPortPointer(e, "pointerdown")}
        on:pointerup={(e: PointerEvent) => this.#onPortPointer(e, "pointerup")}
      >
        <div class="flow-node-port-col is-in flow-node-ports">
          <Index each={inGroups()}>{(g) => this.#renderGroup(g, "in", inGroups().length > 1)}</Index>
        </div>
        <div class="flow-node-body">
          <span class="flow-node-title">{v()?.name}</span>
          <span class="flow-node-icon" aria-hidden="true" innerHTML={v() ? renderIconSvg(v()!.icon) : ""} />
          {v()?.paramsLine && <div class="flow-node-params">{v()!.paramsLine}</div>}
          {v()?.showInputs && (
            <button
              class="flow-node-config"
              type="button"
              title={v()!.inputsEnabled ? "Configure inputs" : "Stop the run to configure inputs"}
              disabled={!v()!.inputsEnabled}
              data-testid={`inputs-${v()!.blockId}`}
              onPointerDown={(e: PointerEvent) => e.stopPropagation()}
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                if (v()!.inputsEnabled) this.#dispatch("inputsclick");
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="8" cy="8" r="2.1"/>
                <path d="M8 2.4v1.5M8 12.1v1.5M2.4 8h1.5M12.1 8h1.5M4 4l1.1 1.1M10.9 10.9 12 12M4 12l1.1-1.1M10.9 5.1 12 4"/>
              </svg>
            </button>
          )}
          {v()?.showGpio && (
            <div class="form-check form-switch flow-node-gpio" onPointerDown={(e: PointerEvent) => e.stopPropagation()}>
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id={`gpio-switch-${v()!.blockId}`}
                checked={v()!.gpioOn}
                disabled={!v()!.gpioInteractive}
                aria-label={`GPIO pin ${v()!.gpioPin} ${v()!.gpioOn ? "HIGH" : "LOW"}`}
                title={v()!.gpioInteractive ? `Simulate GPIO pin ${v()!.gpioPin} in the browser` : `GPIO pin ${v()!.gpioPin} output`}
                data-testid={`gpio-${v()!.blockId}`}
                onClick={(e: MouseEvent) => e.stopPropagation()}
                onChange={(e: Event) => {
                  e.stopPropagation();
                  if (v()!.gpioInteractive) this.#dispatch("gpioclick");
                }}
              />
            </div>
          )}
          {v()?.showChart && (
            <button
              class="flow-node-chart"
              type="button"
              title={v()!.chartEnabled ? "Open live chart" : "Run the diagram to open the chart"}
              disabled={!v()!.chartEnabled}
              data-testid={`chart-${v()!.blockId}`}
              onPointerDown={(e: PointerEvent) => e.stopPropagation()}
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                if (v()!.chartEnabled) this.#dispatch("chartclick");
              }}
            >
              Chart
            </button>
          )}
        </div>
        <div class="flow-node-port-col is-out flow-node-ports">
          <Index each={outGroups()}>{(g) => this.#renderGroup(g, "out", outGroups().length > 1)}</Index>
        </div>
      </div>
    );
  }
}

customElements.define("bld-node", BldNode);

declare global {
  interface HTMLElementTagNameMap {
    "bld-node": BldNode;
  }
}
