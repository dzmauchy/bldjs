import { createEffect, createSignal, For, type JSX } from "solid-js";
import { type BlockDef } from "@bld/xml/blocks/ast";
import { isArrayType, type PortDef } from "@bld/types/ast";
import { FLOW_MIME, PALETTE_DROP_EVENT, type PaletteDropDetail } from "$lib/flow/mime";
import { AppHost } from "./app-host";
import { type PaletteGroup, buildPaletteTree, paletteGroupIds } from "./palette-tree";
import "./block-icon";

const PALETTE_DRAG = 3;

interface PointerDrag {
  pointerId: number;
  defId: string;
  startX: number;
  startY: number;
  dragged: boolean;
  ghost: HTMLElement | null;
  source: HTMLElement | null;
}

export class BldPalette extends AppHost {
  readonly #openNs = createSignal<Set<string> | null>(null);
  #drag: PointerDrag | null = null;

  override disconnectedCallback(): void {
    this.#cancelPointerDrag();
    super.disconnectedCallback();
  }

  #lastCatalog: unknown = null;
  #cachedTree: PaletteGroup[] = [];

  #tree(): PaletteGroup[] {
    const catalog = this.rawApp?.catalog ?? this.app.catalog;
    if (catalog && catalog !== this.#lastCatalog) {
      this.#lastCatalog = catalog;
      this.#cachedTree = buildPaletteTree(catalog);
    }
    return this.#cachedTree;
  }

  #opened(groups: PaletteGroup[]): Set<string> {
    const current = this.#openNs[0]();
    if (current === null) {
      const initial = new Set(paletteGroupIds(groups));
      this.#openNs[1](initial);
      return initial;
    }
    return current;
  }

  #toggleNs(ns: string, groups: PaletteGroup[]): void {
    const next = new Set(this.#opened(groups));
    if (next.has(ns)) next.delete(ns);
    else next.add(ns);
    this.#openNs[1](next);
  }

  #placeAtCenter(defId: string): void {
    const app = this.app;
    app.selectedPaletteDefId = null;
    app.draggingDefId = null;
    app.addBlockAtViewCenter(defId);
    if (app.compactUi) app.closePalette();
  }

  #renderPort(port: PortDef, side: "in" | "out", showName = false): JSX.Element {
    const isVector = port.vararg || isArrayType(port.ty);
    const meta = showName && <span class="block-port-meta"><span class="block-port-name">{port.name}</span></span>;
    const pin = <span class="block-port-anchor"><span class="block-port"></span></span>;
    if (!isVector) {
      return <div class={`block-port-row is-${side}`}>{pin}{meta}</div>;
    }
    return (
      <div class={`block-port-vector is-${side}`}>
        <div class="block-port-vector-pins"><div class={`block-port-row is-${side} is-vector`}>{pin}</div></div>
        <span class="block-port-vector-rail" aria-hidden="true"></span>
        {meta}
      </div>
    );
  }

  #renderBlock(def: BlockDef): JSX.Element {
    const app = this.reactiveApp;
    const kind = app.kindOf(def);
    const isSelected = () => app.selectedPaletteDefId === def.id;
    const isDragging = () => app.draggingDefId === def.id;
    const hint = def.attributes.find((a) => a.name === "description")?.value ?? kind.hint;

    return (
      <div
        class={`palette-item flow-node ${kind.className}${isDragging() ? " is-drag-source" : ""}${isSelected() ? " is-selected" : ""}`}
        role="button"
        tabindex="0"
        draggable="true"
        data-selected={isSelected() ? "" : undefined}
        data-testid={`palette-${def.id}`}
        title={`${hint} — click to select and drop on canvas, drag onto canvas, or double-click to drop at center`}
        onPointerDown={(e: PointerEvent) => this.#onItemPointerDown(e, def.id)}
        onDragStart={(e: DragEvent) => this.#onDragStart(e, def.id)}
        onDragEnd={() => this.#onDragEnd()}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.#placeAtCenter(def.id);
          }
        }}
        on:dblclick={() => this.#placeAtCenter(def.id)}
      >
        <div class="flow-node-port-col is-in flow-node-ports">
          <For each={def.inputs}>{(port) => this.#renderPort(port, "in", def.inputs.length > 1)}</For>
        </div>
        <div class="flow-node-body">
          <span class="flow-node-title">{def.name}</span>
          <span class="flow-node-icon" aria-hidden="true">
            <bld-block-icon name={def.icon}></bld-block-icon>
          </span>
        </div>
        <div class="flow-node-port-col is-out flow-node-ports">
          <For each={def.outputs}>{(port) => this.#renderPort(port, "out", def.outputs.length > 1)}</For>
        </div>
      </div>
    );
  }

  #renderGroup(group: PaletteGroup, groups: PaletteGroup[], nested: boolean): JSX.Element {
    const isOpen = () => this.#opened(groups).has(group.id);

    return (
      <div class={`palette-ns${nested ? " is-child" : ""}`}>
        <button
          class={`palette-ns-toggle${isOpen() ? " open" : ""}`}
          type="button"
          data-testid={`ns-${group.id}`}
          onPointerDown={(e: PointerEvent) => e.stopPropagation()}
          onClick={() => this.#toggleNs(group.id, groups)}
        >
          {group.label}
        </button>
        {isOpen() && (
          <div class={`palette-ns-body${nested ? " is-nested" : ""}`}>
            {group.blocks.length > 0 && (
              <div class="palette-blocks-grid">
                <For each={group.blocks}>{(def) => this.#renderBlock(def)}</For>
              </div>
            )}
            <For each={group.children}>{(child) => this.#renderGroup(child, groups, true)}</For>
          </div>
        )}
      </div>
    );
  }

  #onItemPointerDown(event: PointerEvent, defId: string): void {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const source = (event.currentTarget as HTMLElement | null)?.closest(".palette-item") as HTMLElement | null;
    if (!source) return;
    this.#cancelPointerDrag();
    this.#drag = {
      pointerId: event.pointerId,
      defId,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
      ghost: null,
      source,
    };
    source.addEventListener("pointermove", this.#onSourcePointerMove);
    source.addEventListener("pointerup", this.#onWindowPointerUp);
    source.addEventListener("pointercancel", this.#onWindowPointerUp);
  }

  #onSourcePointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || drag.dragged || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < PALETTE_DRAG) return;
    if (event.pointerType === "touch" && Math.abs(dy) > Math.abs(dx) * 1.5) {
      this.#cancelPointerDrag();
      return;
    }
    event.preventDefault();
    drag.dragged = true;
    if (drag.source) drag.source.draggable = false;
    this.app.draggingDefId = drag.defId;
    drag.ghost = this.#ghostFor(drag.defId, event.clientX, event.clientY);
    document.body.append(drag.ghost);
    window.addEventListener("pointermove", this.#onWindowPointerMove);
    window.addEventListener("pointerup", this.#onWindowPointerUp);
    window.addEventListener("pointercancel", this.#onWindowPointerUp);
  };

  #onWindowPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || !drag.dragged || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    if (drag.ghost) {
      drag.ghost.style.left = `${event.clientX}px`;
      drag.ghost.style.top = `${event.clientY}px`;
    }
  };

  #onWindowPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { defId, dragged, source } = drag;
    const { clientX, clientY } = event;
    const cancelled = event.type === "pointercancel";
    this.#cancelPointerDrag();
    if (source) source.draggable = true;
    this.app.draggingDefId = null;
    if (cancelled) return;
    if (dragged) {
      if (this.app.compactUi) this.app.closePalette();
      const detail: PaletteDropDetail = { defId, clientX, clientY };
      window.dispatchEvent(new CustomEvent(PALETTE_DROP_EVENT, { detail }));
      return;
    }
    if (this.app.compactUi) {
      this.app.closePalette();
      this.app.addBlockAtViewCenter(defId);
      return;
    }
    this.app.selectPaletteDef(defId);
  };

  #ghostFor(defId: string, clientX: number, clientY: number): HTMLElement {
    const ghost = document.createElement("div");
    ghost.className = "bld-drag-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = this.app.blockDef(defId)?.name ?? defId;
    ghost.style.left = `${clientX}px`;
    ghost.style.top = `${clientY}px`;
    return ghost;
  }

  #cancelPointerDrag(): void {
    const drag = this.#drag;
    if (!drag) return;
    this.#drag = null;
    if (drag.source) drag.source.draggable = true;
    drag.source?.removeEventListener("pointermove", this.#onSourcePointerMove);
    drag.source?.removeEventListener("pointerup", this.#onWindowPointerUp);
    drag.source?.removeEventListener("pointercancel", this.#onWindowPointerUp);
    window.removeEventListener("pointermove", this.#onWindowPointerMove);
    window.removeEventListener("pointerup", this.#onWindowPointerUp);
    window.removeEventListener("pointercancel", this.#onWindowPointerUp);
    drag.ghost?.remove();
  }

  #onDragStart(event: DragEvent, defId: string): void {
    this.app.draggingDefId = defId;
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(FLOW_MIME, defId);
    event.dataTransfer.effectAllowed = "move";
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      event.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
    }
  }

  #onDragEnd(): void {
    this.app.draggingDefId = null;
    if (this.app.compactUi) this.app.closePalette();
  }

  override render(): JSX.Element {
    const app = this.reactiveApp;
    if (!app) return null;

    createEffect(() => {
      this.toggleAttribute("data-open", app.paletteVisible());
      this.toggleAttribute("data-dragging", Boolean(app.draggingDefId));
    });

    const groups = () => this.#tree();

    return (
      <aside class="palette">
        <div class="palette-header">
          <div>
            <div class="palette-title">Blocks</div>
            <div class="palette-subtitle">Drag onto the canvas</div>
          </div>
          <button
            class="palette-close"
            type="button"
            title="Close blocks"
            aria-label="Close blocks"
            data-testid="palette-close"
            onClick={() => app.closePalette()}
          >
            ×
          </button>
        </div>
        <div class="palette-list" data-testid="palette-list">
          <For each={groups()}>{(group) => this.#renderGroup(group, groups(), false)}</For>
        </div>
      </aside>
    );
  }
}

customElements.define("bld-palette", BldPalette);

declare global {
  interface HTMLElementTagNameMap {
    "bld-palette": BldPalette;
  }
}
