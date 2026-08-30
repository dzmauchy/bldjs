import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { type BlockDef } from "$lib/blocks";
import { AppController } from "$lib/context";
import { FLOW_MIME } from "$lib/flow";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";
import { type PaletteGroup, buildPaletteTree, paletteGroupIds } from "./palette-tree";
import "./block-icon";

export class BldPalette extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;
  #open: Set<string> | null = null;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: flex;
        width: 200px;
        flex: 0 0 200px;
      }
      .palette {
        width: 200px;
        flex: 0 0 200px;
        background: #1c2125;
      }
      .palette-list {
        padding: 0;
        touch-action: pan-y;
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
    `,
  ];

  constructor() {
    super();
    this.app = undefined as unknown as AppState;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#bindApp();
  }

  protected override willUpdate(): void {
    this.#bindApp();
  }

  #bindApp(): void {
    if (!this.app || this.#ctrl?.app === this.app) {
      return;
    }
    this.#ctrl = new AppController(this, this.app);
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
        @dragstart=${(event: DragEvent) => this.#onDragStart(event, def.id)}
        @dragend=${() => this.#onDragEnd()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            app.addBlockAtViewCenter(def.id);
          }
        }}
        @dblclick=${() => {
          app.draggingDefId = null;
          app.addBlockAtViewCenter(def.id);
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

  #onDragStart(event: DragEvent, defId: string): void {
    this.app.draggingDefId = defId;
    if (!event.dataTransfer) {
      return;
    }
    event.dataTransfer.setData(FLOW_MIME, defId);
    event.dataTransfer.effectAllowed = "move";
  }

  #onDragEnd(): void {
    this.app.draggingDefId = null;
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
          <div class="small text-uppercase text-secondary fw-semibold">Blocks</div>
          <div class="small text-secondary">Drag onto the canvas</div>
        </div>
        <div class="palette-list flex-grow-1 overflow-auto">
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
