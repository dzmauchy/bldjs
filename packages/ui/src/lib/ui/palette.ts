import { css, html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { type BlockDef } from "@bld/xml/blocks/ast";
import { FLOW_MIME, PALETTE_DROP_EVENT, type PaletteDropDetail } from "$lib/flow/mime";
import { bootstrapStyles } from "./bootstrap";
import { AppHost } from "./app-host";
import { type PaletteGroup, buildPaletteTree, paletteGroupIds } from "./palette-tree";
import "./block-icon";

const PALETTE_DRAG = 10;

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

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: flex;
        width: 200px;
        flex: 0 0 200px;
        min-height: 0;
        height: 100%;
        overflow: hidden;
      }
      .palette {
        display: flex;
        flex-direction: column;
        width: 100%;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        height: 100%;
        overflow: hidden;
        background: #1c2125;
      }
      .palette-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .palette-close {
        display: none;
        border: 0;
        background: transparent;
        color: var(--bs-secondary-color, #adb5bd);
        padding: 0 0.15rem;
        line-height: 1;
        font-size: 1.35rem;
        cursor: pointer;
      }
      .palette-list {
        padding: 0;
        min-height: 0;
        flex: 1 1 auto;
        overflow-x: hidden;
        overflow-y: auto;
        touch-action: pan-y;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      .palette-ns {
        border-bottom: 1px solid var(--bs-border-color);
      }
      .palette-ns.is-child {
        border-bottom: 0;
      }
      .palette-ns.is-child .palette-ns-toggle {
        padding-left: 1.35rem;
        background: #15191c;
        font-size: 0.68rem;
      }
      .palette-ns-body.is-nested {
        padding-left: 0.35rem;
      }
      .palette-ns-toggle {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        border: 0;
        background: #181c1f;
        color: inherit;
        text-align: left;
        padding: 0.55rem 0.9rem;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .palette-ns-toggle::after {
        content: "▸";
        font-size: 0.7rem;
        opacity: 0.7;
      }
      .palette-ns-toggle.open::after {
        content: "▾";
      }
      .palette-ns-toggle:hover {
        background: #1f2529;
      }
      .palette-ns-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
      }
      .palette-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border: 1px solid var(--bs-border-color);
        border-left: 3px solid var(--block-accent);
        border-radius: 6px;
        background: #23282d;
        color: inherit;
        cursor: grab;
        user-select: none;
        font-size: 0.8rem;
        font-weight: 600;
        touch-action: pan-y;
      }
      .palette-item:hover {
        background: #2b3238;
      }
      .palette-item:active {
        cursor: grabbing;
      }
      .palette-item.is-drag-source {
        opacity: 0.38;
      }
      .palette-item-icon {
        color: var(--block-accent);
        width: 1.1rem;
        height: 1.1rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }
      .palette-item-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .block-kind-start {
        --block-accent: var(--bs-success);
      }
      .block-kind-process {
        --block-accent: var(--bs-primary);
      }
      .block-kind-decision {
        --block-accent: var(--bs-warning);
      }
      .block-kind-data {
        --block-accent: var(--bs-info);
      }
      .block-kind-output {
        --block-accent: var(--bs-danger);
      }
      :host([data-compact]) {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        height: auto;
        width: min(168px, 78vw);
        flex: none;
        z-index: 6;
        display: none;
        box-shadow: 8px 0 24px rgba(0, 0, 0, 0.45);
      }
      :host([data-compact][data-open]) {
        display: flex;
      }
      :host([data-compact][data-dragging]) {
        opacity: 0.18;
        pointer-events: none;
      }
      :host([data-compact]) .palette {
        width: 100%;
      }
      :host([data-compact]) .palette-close {
        display: inline-flex;
      }
      :host([data-compact]) .palette-ns-toggle {
        padding: 0.38rem 0.6rem;
        font-size: 0.62rem;
      }
      :host([data-compact]) .palette-ns-body {
        gap: 3px;
        padding: 5px;
      }
      :host([data-compact]) .palette-item {
        padding: 4px 6px;
        font-size: 0.68rem;
        gap: 6px;
      }
      :host([data-compact]) .palette-item-icon {
        width: 0.95rem;
        height: 0.95rem;
      }
    `,
  ];

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

  #renderBlock(def: BlockDef) {
    const app = this.app;
    const kind = app.kindOf(def);
    const hint = def.attributes.find((a) => a.name === "description")?.value ?? kind.hint;
    return html`
      <div
        class=${classMap({
          "palette-item": true,
          [kind.className]: true,
          "is-drag-source": app.draggingDefId === def.id,
        })}
        role="button"
        tabindex="0"
        draggable="true"
        data-testid=${`palette-${def.id}`}
        title=${`${hint} — drag onto the canvas, or double-click to drop at the center`}
        @pointerdown=${(event: PointerEvent) => this.#onItemPointerDown(event, def.id)}
        @dragstart=${(event: DragEvent) => this.#onDragStart(event, def.id)}
        @dragend=${() => this.#onDragEnd()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            app.addBlockAtViewCenter(def.id);
            app.closePalette();
          }
        }}
        @dblclick=${() => {
          app.draggingDefId = null;
          app.addBlockAtViewCenter(def.id);
          app.closePalette();
        }}
      >
        <span class="palette-item-icon" aria-hidden="true">
          <bld-block-icon .name=${def.icon}></bld-block-icon>
        </span>
        <span class="palette-item-label">${def.name}</span>
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
                ${group.blocks.map((def) => this.#renderBlock(def))}
                ${group.children.map((child) => this.#renderGroup(child, groups, true))}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  #onItemPointerDown(event: PointerEvent, defId: string): void {
    if (!event.isPrimary || event.pointerType === "mouse") {
      return;
    }
    const source = event.currentTarget;
    if (!(source instanceof HTMLElement)) {
      return;
    }
    source.draggable = false;
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
    if (Math.abs(dy) >= Math.abs(dx)) {
      this.#cancelPointerDrag();
      return;
    }
    event.preventDefault();
    drag.dragged = true;
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
    const { defId, dragged } = drag;
    const clientX = event.clientX;
    const clientY = event.clientY;
    const cancelled = event.type === "pointercancel";
    this.#cancelPointerDrag();
    this.app.draggingDefId = null;
    if (cancelled) {
      return;
    }
    if (this.app.compactUi) {
      this.app.closePalette();
    }
    if (dragged) {
      const detail: PaletteDropDetail = { defId, clientX, clientY };
      window.dispatchEvent(new CustomEvent(PALETTE_DROP_EVENT, { detail }));
      return;
    }
    this.app.addBlockAtViewCenter(defId);
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
      <aside class="palette border-end d-flex flex-column">
        <div class="palette-header px-3 py-2 border-bottom">
          <div>
            <div class="small text-uppercase text-secondary fw-semibold">Blocks</div>
            <div class="small text-secondary">Drag onto the canvas</div>
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
        <div class="palette-list flex-grow-1 overflow-auto" data-testid="palette-list">
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
