import { renderIconSvg } from "./icons";
import { attachShadowStyles } from "./styles";

export type PortSide = "in" | "out";

export interface PortView {
  name: string;
  typeLabel: string;
  vararg: boolean;
  grounded?: boolean;
  compatible?: boolean;
  linking?: boolean;
}

export interface BldNodeState {
  blockId: number;
  defId: string;
  name: string;
  icon: string | null;
  kindClass: string;
  selected: boolean;
  paramsLine: string;
  showChart: boolean;
  inputs: PortView[];
  outputs: PortView[];
}

export interface PortPointerDetail {
  blockId: number;
  port: string;
  side: PortSide;
  clientX: number;
  clientY: number;
  pointerId: number;
}

const NODE_CSS = `
:host {
  display: block;
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
:host(.block-kind-start) { --block-accent: var(--bs-success, #198754); }
:host(.block-kind-process) { --block-accent: var(--bs-primary, #0d6efd); }
:host(.block-kind-decision) { --block-accent: var(--bs-warning, #ffc107); }
:host(.block-kind-data) { --block-accent: var(--bs-info, #0dcaf0); }
:host(.block-kind-output) { --block-accent: var(--bs-danger, #dc3545); }
.flow-node {
  display: flex;
  flex-direction: column;
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
.flow-node-params {
  display: none;
  padding: 0 8px 4px;
  color: var(--bs-info, #0dcaf0);
  font-family: var(--bs-font-monospace, ui-monospace, monospace);
  font-size: 0.65rem;
  flex: 0 0 auto;
}
.flow-node-params.is-visible {
  display: block;
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
.block-port-type {
  font-size: 0.62rem;
  color: var(--bs-info, #0dcaf0);
  white-space: nowrap;
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
.block-port-row.is-bad .block-port-type {
  color: var(--bs-danger, #dc3545);
}
.block-port-row.is-bad .block-port {
  border-color: var(--bs-danger, #dc3545);
}
`;

function portButton(port: PortView, side: PortSide): HTMLButtonElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `block-port-row is-${side}`;
  row.toggleAttribute("data-port", true);
  row.dataset.side = side;
  row.dataset.name = port.name;
  row.dataset.testid = `${side === "in" ? "input" : "output"}-${port.name}`;
  row.title = port.typeLabel;
  row.classList.toggle("is-grounded", port.grounded === true);
  row.classList.toggle("is-linking", port.linking === true);
  row.classList.toggle("is-bad", port.compatible === false);

  const handle = document.createElement("span");
  handle.className = "block-port";
  handle.toggleAttribute("data-handle", true);

  const meta = document.createElement("span");
  meta.className = "block-port-meta";
  const name = document.createElement("span");
  name.className = "block-port-name";
  name.textContent = port.vararg ? `${port.name}…` : port.name;
  const type = document.createElement("span");
  type.className = "block-port-type";
  type.textContent = port.typeLabel;
  meta.append(name, type);

  if (side === "in") {
    row.append(handle, meta);
  } else {
    row.append(meta, handle);
  }
  return row;
}

export class BldNode extends HTMLElement {
  static readonly tagName = "bld-node";

  readonly #shadow: ShadowRoot;
  readonly #root: HTMLDivElement;
  readonly #icon: HTMLSpanElement;
  readonly #title: HTMLSpanElement;
  readonly #chart: HTMLButtonElement;
  readonly #params: HTMLDivElement;
  readonly #inputs: HTMLDivElement;
  readonly #outputs: HTMLDivElement;
  #state: BldNodeState | null = null;
  #resize: ResizeObserver | null = null;
  #kindClass = "";

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open" });
    attachShadowStyles(this.#shadow, NODE_CSS);

    this.#root = document.createElement("div");
    this.#root.className = "flow-node";

    const header = document.createElement("div");
    header.className = "flow-node-header";
    this.#icon = document.createElement("span");
    this.#icon.className = "flow-node-icon";
    this.#icon.setAttribute("aria-hidden", "true");
    this.#title = document.createElement("span");
    this.#title.className = "flow-node-title";
    this.#chart = document.createElement("button");
    this.#chart.type = "button";
    this.#chart.className = "flow-node-chart";
    this.#chart.textContent = "Chart";
    this.#chart.hidden = true;
    this.#chart.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.#chart.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatchEvent(new CustomEvent("chartclick", { bubbles: true, composed: true }));
    });
    header.append(this.#icon, this.#title, this.#chart);

    this.#params = document.createElement("div");
    this.#params.className = "flow-node-params";

    const ports = document.createElement("div");
    ports.className = "flow-node-ports";
    this.#inputs = document.createElement("div");
    this.#inputs.className = "flow-node-port-col";
    this.#outputs = document.createElement("div");
    this.#outputs.className = "flow-node-port-col is-out";
    ports.append(this.#inputs, this.#outputs);

    this.#root.append(header, this.#params, ports);
    this.#shadow.append(this.#root);

    this.#root.addEventListener("pointerdown", (event) => this.#onPortPointer(event, "pointerdown"));
    this.#root.addEventListener("pointerup", (event) => this.#onPortPointer(event, "pointerup"));
  }

  connectedCallback(): void {
    this.#resize?.disconnect();
    this.#resize = new ResizeObserver(() => this.#emitResize());
    this.#resize.observe(this);
    this.#emitResize();
  }

  disconnectedCallback(): void {
    this.#resize?.disconnect();
    this.#resize = null;
  }

  get state(): BldNodeState | null {
    return this.#state;
  }

  set state(value: BldNodeState | null) {
    this.#state = value;
    this.#render();
  }

  get blockId(): number {
    return this.#state?.blockId ?? Number(this.dataset.blockId ?? Number.NaN);
  }

  measuredSize(): { width: number; height: number } {
    return { width: this.offsetWidth, height: this.offsetHeight };
  }

  portCenterClient(side: PortSide, name: string): { x: number; y: number } | undefined {
    const handle = this.#handle(side, name);
    if (!handle) {
      return undefined;
    }
    const rect = handle.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return undefined;
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  static fromComposedPath(event: Event): { node: BldNode; side: PortSide; port: string } | undefined {
    for (const item of event.composedPath()) {
      if (!(item instanceof Element) || !item.hasAttribute("data-port")) {
        continue;
      }
      const root = item.getRootNode();
      if (!(root instanceof ShadowRoot) || !(root.host instanceof BldNode)) {
        continue;
      }
      const side = item.getAttribute("data-side");
      const port = item.getAttribute("data-name");
      if ((side === "in" || side === "out") && port) {
        return { node: root.host, side, port };
      }
    }
    return undefined;
  }

  #handle(side: PortSide, name: string): HTMLElement | null {
    const row = this.#shadow.querySelector(`[data-side="${CSS.escape(side)}"][data-name="${CSS.escape(name)}"]`);
    return row?.querySelector("[data-handle]") ?? null;
  }

  #onPortPointer(event: PointerEvent, phase: "pointerdown" | "pointerup"): void {
    const hit = BldNode.fromComposedPath(event);
    if (!hit || hit.node !== this) {
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
          blockId: this.blockId,
          port: hit.port,
          side: hit.side,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
        },
      }),
    );
  }

  #emitResize(): void {
    const { width, height } = this.measuredSize();
    this.dispatchEvent(
      new CustomEvent("noderesize", {
        bubbles: true,
        composed: true,
        detail: { blockId: this.blockId, width, height },
      }),
    );
  }

  #render(): void {
    const state = this.#state;
    if (!state) {
      return;
    }
    this.dataset.blockId = String(state.blockId);
    this.dataset.blockDef = state.defId;
    this.dataset.testid = "node";
    this.setAttribute("data-testid", "node");
    this.toggleAttribute("data-selected", state.selected);
    this.setAttribute("aria-label", state.name);
    this.setAttribute("role", "group");
    if (this.#kindClass && this.#kindClass !== state.kindClass) {
      this.classList.remove(this.#kindClass);
    }
    this.#kindClass = state.kindClass;
    this.classList.add(state.kindClass);

    this.#title.textContent = state.name;
    this.#icon.innerHTML = renderIconSvg(state.icon);
    this.#chart.hidden = !state.showChart;
    this.#chart.dataset.testid = `chart-${state.blockId}`;
    this.#chart.setAttribute("data-testid", `chart-${state.blockId}`);
    this.#chart.title = "Open live chart";

    this.#params.textContent = state.paramsLine;
    this.#params.classList.toggle("is-visible", state.paramsLine.length > 0);

    this.#inputs.replaceChildren(...state.inputs.map((port) => portButton(port, "in")));
    this.#outputs.replaceChildren(...state.outputs.map((port) => portButton(port, "out")));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "bld-node": BldNode;
  }
}
