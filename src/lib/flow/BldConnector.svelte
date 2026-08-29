<svelte:options
  customElement={{
    tag: "bld-connector",
    shadow: "open",
    props: {
      from: { type: "Object", reflect: false },
      to: { type: "Object", reflect: false },
      selected: { type: "Boolean", reflect: true, attribute: "data-selected" },
      preview: { type: "Boolean", reflect: true, attribute: "data-preview" },
    },
  }}
/>

<script lang="ts">
  import { cubicLink, cubicLinkBounds, translatePath, type Point } from "./geometry";

  let {
    from = { x: 0, y: 0 },
    to = { x: 0, y: 0 },
    selected = false,
    preview = false,
  }: {
    from?: Point;
    to?: Point;
    selected?: boolean;
    preview?: boolean;
  } = $props();

  const link = $derived(cubicLink(from, to));
  const box = $derived(cubicLinkBounds(link));
  const d = $derived(translatePath(link, { x: box.left, y: box.top }));

  $effect.pre(() => {
    const host = $host();
    host.style.left = `${box.left}px`;
    host.style.top = `${box.top}px`;
    host.style.width = `${box.width}px`;
    host.style.height = `${box.height}px`;
    host.toggleAttribute("data-selected", selected);
    host.toggleAttribute("data-preview", preview);
    host.setAttribute("data-testid", preview ? "connector-preview" : "connector");
  });

  function onHitPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
    $host().dispatchEvent(
      new CustomEvent("linkpointerdown", {
        bubbles: true,
        composed: true,
        detail: { clientX: event.clientX, clientY: event.clientY },
      }),
    );
  }
</script>

<svg width={box.width} height={box.height} viewBox={`0 0 ${box.width} ${box.height}`}>
  <path class="path-hit" {d} role="button" tabindex="-1" onpointerdown={onHitPointerDown}></path>
  <path class="path-stroke" {d}></path>
</svg>

<style>
  :host {
    display: block;
    position: absolute;
    z-index: 0;
    pointer-events: none;
    overflow: visible;
  }
  :host([data-preview]) {
    z-index: 3;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .path-hit {
    fill: none;
    stroke: transparent;
    stroke-width: 14;
    stroke-linecap: round;
    pointer-events: stroke;
    cursor: pointer;
  }
  .path-stroke {
    fill: none;
    stroke: color-mix(in srgb, var(--bs-primary, #0d6efd) 80%, white);
    stroke-width: 2.2;
    stroke-linecap: round;
    pointer-events: none;
  }
  :host([data-selected]) .path-stroke {
    stroke: var(--bs-info, #0dcaf0);
    stroke-width: 3;
  }
  :host([data-preview]) .path-stroke {
    stroke-dasharray: 6 4;
  }
  :host([data-preview]) .path-hit {
    pointer-events: none;
  }
</style>
