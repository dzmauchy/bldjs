import { LitElement, css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { AppController } from "$lib/context";
import { COMPACT_UI_QUERY, isNoneId } from "$lib/model";
import { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";
import "./about-modal";
import "./toolbar";
import "./scope-modal";
import "./palette";
import "./status-bar";
import "./workspace";

export class BldApp extends LitElement {
  readonly app = new AppState();
  #ctrl = new AppController(this, this.app);
  #compact?: MediaQueryList;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        background: var(--bs-body-bg);
        color: var(--bs-body-color);
      }
      .app-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bs-body-bg);
        color: var(--bs-body-color);
      }
      .app-body {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        position: relative;
        background: #121416;
      }
      .palette-backdrop {
        position: absolute;
        inset: 0;
        z-index: 5;
        background: rgba(0, 0, 0, 0.4);
      }
      bld-palette {
        z-index: 6;
      }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.#onKey);
    if (typeof window.matchMedia === "function") {
      this.#compact = window.matchMedia(COMPACT_UI_QUERY);
      this.app.compactUi = this.#compact.matches;
      this.#compact.addEventListener("change", this.#onCompactChange);
    }
  }

  disconnectedCallback(): void {
    this.app.stopRun();
    window.removeEventListener("keydown", this.#onKey);
    this.#compact?.removeEventListener("change", this.#onCompactChange);
    super.disconnectedCallback();
  }

  #onCompactChange = (event: MediaQueryListEvent): void => {
    this.app.compactUi = event.matches;
  };

  #onKey = (event: KeyboardEvent): void => {
    const app = this.app;
    const meta = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "Delete":
      case "Backspace":
        if (app.aboutOpen || !isNoneId(app.scopeOpen)) {
          break;
        }
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
          break;
        }
        event.preventDefault();
        app.deleteSelected();
        break;
      case "Escape":
        app.clearSelection();
        app.aboutOpen = false;
        app.draggingDefId = null;
        app.linkingFrom = null;
        app.closePalette();
        app.closeScope();
        break;
      case "0":
        if (meta) {
          event.preventDefault();
          app.resetView();
        }
        break;
      case "=":
      case "+":
        if (meta) {
          event.preventDefault();
          app.zoomIn();
        }
        break;
      case "-":
        if (meta) {
          event.preventDefault();
          app.zoomOut();
        }
        break;
      default:
        break;
    }
  };

  protected override render() {
    const app = this.app;
    return html`
      <div class=${classMap({ "app-shell": true, "is-dragging": app.isDragging() })}>
        <bld-toolbar .app=${app}></bld-toolbar>
        <div class="app-body">
          ${app.compactUi && app.paletteOpen
            ? html`<div
                class="palette-backdrop"
                data-testid="palette-backdrop"
                @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
                @click=${() => app.closePalette()}
              ></div>`
            : nothing}
          <bld-palette .app=${app}></bld-palette>
          <bld-workspace .app=${app}></bld-workspace>
        </div>
        <bld-status-bar .app=${app}></bld-status-bar>
      </div>
      <bld-about-modal .app=${app}></bld-about-modal>
      <bld-scope-modal .app=${app}></bld-scope-modal>
    `;
  }
}

customElements.define("bld-app", BldApp);

declare global {
  interface HTMLElementTagNameMap {
    "bld-app": BldApp;
  }
}
