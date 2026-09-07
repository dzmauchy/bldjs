import { html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
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
  #open: Set<string> | null = null;
  #drag: PointerDrag | null = null;

  override disconnectedCallback(): void {
    this.#cancelPointerDrag();
    super.disconnectedCallback();
  }

  protected override updated(): void {
    super.updated();
    this.toggleAttribute("data-open", this.app?.paletteVisible() ?? false);
    this.toggleAttribute("data-dragging", Boolean(this.app?.draggingDefId));
  }

  #tree(): PaletteGroup[] {
    return buildPaletteTree(this.app.catalog);
  }

  #opened(groups: PaletteGroup[]): Set<string> {
    if (this.#open === null) {
      this.#open = new Set(paletteGroupIds(groups));
    }
    return this.#open;
  }

  #toggleNs(ns: string, groups: PaletteGroup[]): void {
    const open = this.#opened(groups);
    const nsSet = new Set([ns]);
    this.#open = open.has(ns) ? open.difference(nsSet) : open.union(nsSet);
    this.requestUpdate();
  }

  #renderPort(port: PortDef, side: "in" | "out", showName: boolean = false) {
    const isVector = port.vararg || isArrayType(port.ty);
    const meta = showName
      ? html`
          <span class="block-port-meta">
            <span class="block-port-name">${port.name}</span>
          </span>
        `
      : nothing;
    if (!isVector) {
      return html`
        <div class="block-port-row is-${side}">
          <span class="block-port-anchor">
            <span class="block-port"></span>
          </span>
          ${meta}
        </div>
      `;
    }
    return html`
      <div class="block-port-vector is-${side}">
        <div class="block-port-vector-pins">
          <div class="block-port-row is-${side} is-vector">
            <span class="block-port-anchor">
              <span class="block-port"></span>
            </span>
          </div>
        </div>
        <span class="block-port-vector-rail" aria-hidden="true"></span>
        ${meta}
      </div>
    `;
  }

  #renderBlock(def: BlockDef) {
    const app = this.app;
    const kind = app.kindOf(def);
    const isSelected = app.selectedPaletteDefId === def.id;
    const hint = def.attributes.find((a) => a.name === "description")?.value ?? kind.hint;
    return html`
      <div
        class=${classMap({
          "palette-item": true,
          "flow-node": true,
          [kind.className]: true,
          "is-drag-source": app.draggingDefId === def.id,
          "is-selected": isSelected,
        })}
        role="button"
        tabindex="0"
        draggable="true"
        data-selected=${isSelected ? "" : nothing}
        data-testid=${`palette-${def.id}`}
        title=${`${hint} — click to select and drop on canvas, drag onto canvas, or double-click to drop at center`}
        @pointerdown=${(event: PointerEvent) => this.#onItemPointerDown(event, def.id)}
        @dragstart=${(event: DragEvent) => this.#onDragStart(event, def.id)}
        @dragend=${() => this.#onDragEnd()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            app.selectedPaletteDefId = null;
            app.addBlockAtViewCenter(def.id);
            if (app.compactUi) {
              app.closePalette();
            }
          }
        }}
        @dblclick=${() => {
          app.draggingDefId = null;
          app.selectedPaletteDefId = null;
          app.addBlockAtViewCenter(def.id);
          if (app.compactUi) {
            app.closePalette();
          }
        }}
      >
        <div class="flow-node-port-col is-in flow-node-ports">
          ${def.inputs.map((port) => this.#renderPort(port, "in", def.inputs.length > 1))}
        </div>
        <div class="flow-node-body">
          <span class="flow-node-title">${def.name}</span>
          <span class="flow-node-icon" aria-hidden="true">
            <bld-block-icon .name=${def.icon}></bld-block-icon>
          </span>
        </div>
        <div class="flow-node-port-col is-out flow-node-ports">
          ${def.outputs.map((port) => this.#renderPort(port, "out", def.outputs.length > 1))}
        </div>
      </div>
    `;
  }

  #renderGroup(group: PaletteGroup, groups: PaletteGroup[], nested: boolean): TemplateResult {
    const open = this.#opened(groups);
    const isOpen = open.has(group.id);
    return html`
      <div class=${classMap({ "palette-ns": true, "is-child": nested })}>
        <button
          class=${classMap({ "palette-ns-toggle": true, open: isOpen })}
          type="button"
          data-testid=${`ns-${group.id}`}
          @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
          @click=${() => this.#toggleNs(group.id, groups)}
        >
          ${group.label}
        </button>
        ${isOpen
          ? html`
              <div class=${classMap({ "palette-ns-body": true, "is-nested": nested })}>
                ${group.blocks.length > 0
                  ? html`
                      <div class="palette-blocks-grid">
                        ${group.blocks.map((def) => this.#renderBlock(def))}
                      </div>
                    `
                  : nothing}
                ${group.children.map((child) => this.#renderGroup(child, groups, true))}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  #onItemPointerDown(event: PointerEvent, defId: string): void {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    const source = event.currentTarget;
    if (!(source instanceof HTMLElement)) {
      return;
    }
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
    if (!drag || drag.dragged || event.pointerId !== drag.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < PALETTE_DRAG) {
      return;
    }
    if (event.pointerType === "touch" && Math.abs(dy) > Math.abs(dx) * 1.5) {
      this.#cancelPointerDrag();
      return;
    }
    event.preventDefault();
    drag.dragged = true;
    if (drag.source) {
      drag.source.draggable = false;
    }
    this.app.draggingDefId = drag.defId;
    drag.ghost = this.#ghostFor(drag.defId, event.clientX, event.clientY);
    document.body.append(drag.ghost);
    window.addEventListener("pointermove", this.#onWindowPointerMove);
    window.addEventListener("pointerup", this.#onWindowPointerUp);
    window.addEventListener("pointercancel", this.#onWindowPointerUp);
  };

  #onWindowPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || !drag.dragged || event.pointerId !== drag.pointerId) {
      return;
    }
    event.preventDefault();
    if (drag.ghost) {
      drag.ghost.style.left = `${event.clientX}px`;
      drag.ghost.style.top = `${event.clientY}px`;
    }
  };

  #onWindowPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const { defId, dragged, source } = drag;
    const clientX = event.clientX;
    const clientY = event.clientY;
    const cancelled = event.type === "pointercancel";
    this.#cancelPointerDrag();
    if (source) {
      source.draggable = true;
    }
    this.app.draggingDefId = null;
    if (cancelled) {
      return;
    }
    if (dragged) {
      if (this.app.compactUi) {
        this.app.closePalette();
      }
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
    this.#drag = null;
    if (drag?.source) {
      drag.source.draggable = true;
    }
    drag?.source?.removeEventListener("pointermove", this.#onSourcePointerMove);
    drag?.source?.removeEventListener("pointerup", this.#onWindowPointerUp);
    drag?.source?.removeEventListener("pointercancel", this.#onWindowPointerUp);
    window.removeEventListener("pointermove", this.#onWindowPointerMove);
    window.removeEventListener("pointerup", this.#onWindowPointerUp);
    window.removeEventListener("pointercancel", this.#onWindowPointerUp);
    drag?.ghost?.remove();
  }

  #onDragStart(event: DragEvent, defId: string): void {
    this.app.draggingDefId = defId;
    if (!event.dataTransfer) {
      return;
    }
    event.dataTransfer.setData(FLOW_MIME, defId);
    event.dataTransfer.effectAllowed = "move";
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      event.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
    }
  }

  #onDragEnd(): void {
    this.app.draggingDefId = null;
    if (this.app.compactUi) {
      this.app.closePalette();
    }
  }

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    const groups = this.#tree();
    return html`
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
            @click=${() => app.closePalette()}
          >
            ×
          </button>
        </div>
        <div class="palette-list" data-testid="palette-list">
          ${groups.map((group) => this.#renderGroup(group, groups, false))}
        </div>
      </aside>
    `;
  }
}

customElements.define("bld-palette", BldPalette);

declare global {
  interface HTMLElementTagNameMap {
    "bld-palette": BldPalette;
  }
}
