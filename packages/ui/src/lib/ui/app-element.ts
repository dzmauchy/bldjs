import { LitElement, css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { AppController } from "$lib/context";
import { COMPACT_UI_QUERY, compactUiMatches, isNoneId } from "$lib/model";
import { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";
import "./about-modal";
import "./diagram-io-modal";
import "./toolbar";
import "./scope-modal";
import "./inputs-modal";
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
      :host([data-compact]) {
        font-size: 13px;
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
    window.addEventListener("orientationchange", this.#syncCompact);
    window.addEventListener("resize", this.#syncCompact);
    if (typeof window.matchMedia === "function") {
      this.#compact = window.matchMedia(COMPACT_UI_QUERY);
      this.#compact.addEventListener("change", this.#syncCompact);
    }
    this.#syncCompact();
  }

  disconnectedCallback(): void {
    this.app.run.stop();
    window.removeEventListener("keydown", this.#onKey);
    window.removeEventListener("orientationchange", this.#syncCompact);
    window.removeEventListener("resize", this.#syncCompact);
    this.#compact?.removeEventListener("change", this.#syncCompact);
    document.documentElement.classList.remove("compact-ui");
    super.disconnectedCallback();
  }

  protected override updated(): void {
    this.toggleAttribute("data-compact", this.app.compactUi);
    document.documentElement.classList.toggle("compact-ui", this.app.compactUi);
  }

  #syncCompact = (): void => {
    this.app.compactUi = compactUiMatches();
  };

  #onKey = (event: KeyboardEvent): void => {
    const app = this.app;
    const meta = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "Delete":
      case "Backspace":
        if (app.aboutOpen || app.io.mode !== "closed" || !isNoneId(app.inputsOpen)) {
          break;
        }
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
          break;
        }
        event.preventDefault();
        app.deleteSelected();
        break;
      case "Escape":
        if (app.io.mode !== "closed") {
          app.io.close();
          break;
        }
        app.clearSelection();
        app.aboutOpen = false;
        app.draggingDefId = null;
        app.linkingFrom = null;
        app.closePalette();
        app.closeScope();
        app.closeInputs();
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
      <bld-diagram-io-modal .app=${app}></bld-diagram-io-modal>
      <bld-scope-modal .app=${app}></bld-scope-modal>
      <bld-inputs-modal .app=${app}></bld-inputs-modal>
    `;
  }
}

customElements.define("bld-app", BldApp);

declare global {
  interface HTMLElementTagNameMap {
    "bld-app": BldApp;
  }
}
