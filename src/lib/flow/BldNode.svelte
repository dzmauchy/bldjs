<svelte:options
  customElement={{
    tag: "bld-node",
    shadow: "open",
    props: {
      view: { type: "Object", reflect: false },
      x: { type: "Number" },
      y: { type: "Number" },
      dragging: { type: "Boolean", reflect: true, attribute: "data-dragging" },
    },
  }}
/>

<script lang="ts">
  import { iconSvgInner } from "./icons";
  import { measureHostLayout, portFromComposedPath } from "./layout";
  import type { BldNodeState, NodeLayout, PortPointerDetail, PortSide, PortView } from "./types";

  let {
    view = null,
    x = 0,
    y = 0,
    dragging = false,
  }: {
    view?: BldNodeState | null;
    x?: number;
    y?: number;
    dragging?: boolean;
  } = $props();

  let kindClass = $state("");

  $effect.pre(() => {
    const host = $host();
    host.style.transform = `translate(${x}px, ${y}px)`;
  });

  $effect.pre(() => {
    const host = $host();
    const next = view;
    if (!next) {
      return;
    }
    host.dataset.blockId = String(next.blockId);
    host.dataset.blockDef = next.defId;
    host.setAttribute("data-testid", "node");
    host.toggleAttribute("data-selected", next.selected);
    host.toggleAttribute("data-dragging", dragging);
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", next.name);
    if (kindClass && kindClass !== next.kindClass) {
      host.classList.remove(kindClass);
    }
    kindClass = next.kindClass;
    host.classList.add(next.kindClass);
  });

  $effect(() => {
    const host = $host();
    void view;
    void view?.inputs;
    void view?.outputs;
    void view?.paramsLine;
    emitLayout(host);
    if (typeof ResizeObserver !== "function") {
      return;
    }
    const observer = new ResizeObserver(() => emitLayout(host));
    observer.observe(host);
    return () => observer.disconnect();
  });

  function emitLayout(host: HTMLElement): void {
    const layout = measureHostLayout(host);
    host.dispatchEvent(
      new CustomEvent<NodeLayout>("noderesize", {
        bubbles: true,
        composed: true,
        detail: layout,
      }),
    );
  }

  function onPortPointer(event: PointerEvent, phase: "pointerdown" | "pointerup"): void {
    const hit = portFromComposedPath(event);
    if (!hit || hit.host !== $host()) {
      return;
    }
    event.stopPropagation();
    if (phase === "pointerdown") {
      event.preventDefault();
    }
    const name = phase === "pointerdown" ? "portpointerdown" : "portpointerup";
    $host().dispatchEvent(
      new CustomEvent<PortPointerDetail>(name, {
        bubbles: true,
        composed: true,
        detail: {
          blockId: view?.blockId ?? Number($host().dataset.blockId),
          port: hit.port,
          side: hit.side,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
        },
      }),
    );
  }

  function onChartClick(event: MouseEvent): void {
    event.stopPropagation();
    $host().dispatchEvent(new CustomEvent("chartclick", { bubbles: true, composed: true }));
  }

  function portTestId(side: PortSide, name: string): string {
    return `${side === "in" ? "input" : "output"}-${name}`;
  }

  function portClass(port: PortView, side: PortSide): string {
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
</script>

{#if view}
  <div class="flow-node" role="group" onpointerdown={(event) => onPortPointer(event, "pointerdown")} onpointerup={(event) => onPortPointer(event, "pointerup")}>
    <div class="flow-node-header">
      <span class="flow-node-icon" aria-hidden="true">
        <svg class="block-icon" viewBox="0 0 16 16" fill="none">
          {@html iconSvgInner(view.icon)}
        </svg>
      </span>
      <span class="flow-node-title">{view.name}</span>
      {#if view.showChart}
        <button
          class="flow-node-chart"
          type="button"
          title="Open live chart"
          data-testid={`chart-${view.blockId}`}
          onpointerdown={(event) => event.stopPropagation()}
          onclick={onChartClick}
        >
          Chart
        </button>
      {/if}
    </div>
    {#if view.paramsLine}
      <div class="flow-node-params">{view.paramsLine}</div>
    {/if}
    <div class="flow-node-ports">
      <div class="flow-node-port-col">
        {#each view.inputs as port (port.name)}
          <button
            class={portClass(port, "in")}
            type="button"
            data-port
            data-side="in"
            data-name={port.name}
            data-testid={portTestId("in", port.name)}
            title={port.typeLabel}
          >
            <span class="block-port" data-handle></span>
            <span class="block-port-meta">
              <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
              <span class="block-port-type">{port.typeLabel}</span>
            </span>
          </button>
        {/each}
      </div>
      <div class="flow-node-port-col is-out">
        {#each view.outputs as port (port.name)}
          <button
            class={portClass(port, "out")}
            type="button"
            data-port
            data-side="out"
            data-name={port.name}
            data-testid={portTestId("out", port.name)}
            title={port.typeLabel}
          >
            <span class="block-port-meta">
              <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
              <span class="block-port-type">{port.typeLabel}</span>
            </span>
            <span class="block-port" data-handle></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
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
</style>
