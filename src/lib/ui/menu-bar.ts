import { LitElement, css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { AppController } from "$lib/context";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";

export class BldMenuBar extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;
  #openMenu: string | null = null;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: block;
        height: 40px;
        flex: 0 0 40px;
      }
      .app-menubar {
        height: 40px;
        background: #1b1f22;
        gap: 0.15rem;
      }
      .app-brand {
        font-weight: 700;
        letter-spacing: 0.04em;
        color: var(--bs-primary);
      }
      .menu-item {
        color: var(--bs-body-color);
        border: 0;
        background: transparent;
        padding: 0.15rem 0.6rem;
      }
      .menu-item:hover,
      .menu-item.active {
        background: var(--bs-tertiary-bg);
        color: var(--bs-body-color);
      }
      .app-menu-dropdown {
        display: none;
        position: absolute;
        top: calc(100% + 2px);
        left: 0;
        min-width: 180px;
        z-index: 20;
      }
      .app-menu-dropdown.show {
        display: block;
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
    window.addEventListener("pointerdown", this.#onWindowPointerDown);
  }

  disconnectedCallback(): void {
    window.removeEventListener("pointerdown", this.#onWindowPointerDown);
    super.disconnectedCallback();
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

  #close(): void {
    this.#openMenu = null;
    this.requestUpdate();
  }

  #toggle(name: string): void {
    this.#openMenu = this.#openMenu === name ? null : name;
    this.requestUpdate();
  }

  #onWindowPointerDown = (event: PointerEvent): void => {
    if (this.#openMenu === null) {
      return;
    }
    const path = event.composedPath();
    if (path.includes(this)) {
      return;
    }
    this.#openMenu = null;
    this.requestUpdate();
  };

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    return html`
      <nav class="app-menubar border-bottom d-flex align-items-center px-2">
        <span class="app-brand me-3">Bld</span>

        <div class="menu-item-wrap position-relative">
          <button
            class=${classMap({ "menu-item": true, btn: true, "btn-sm": true, active: this.#openMenu === "file" })}
            type="button"
            data-testid="menu-file"
            @click=${() => this.#toggle("file")}
          >
            File
          </button>
          <div
            class=${classMap({
              "dropdown-menu": true,
              "app-menu-dropdown": true,
              show: this.#openMenu === "file",
              "d-block": this.#openMenu === "file",
            })}
          >
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-new-canvas"
              @click=${() => {
                app.clearCanvas();
                this.#close();
              }}
            >
              New canvas
            </button>
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-delete-selected"
              @click=${() => {
                app.deleteSelected();
                this.#close();
              }}
            >
              Delete selected
            </button>
            <div class="dropdown-divider"></div>
            <div class="dropdown-header">Associated models</div>
            ${app.sources.map(
              (source) => html`<div class="dropdown-item-text small font-monospace">${source.name}</div>`,
            )}
          </div>
        </div>

        <div class="menu-item-wrap position-relative">
          <button
            class=${classMap({ "menu-item": true, btn: true, "btn-sm": true, active: this.#openMenu === "view" })}
            type="button"
            data-testid="menu-view"
            @click=${() => this.#toggle("view")}
          >
            View
          </button>
          <div
            class=${classMap({
              "dropdown-menu": true,
              "app-menu-dropdown": true,
              show: this.#openMenu === "view",
              "d-block": this.#openMenu === "view",
            })}
          >
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-zoom-in"
              @click=${() => {
                app.zoomIn();
                this.#close();
              }}
            >
              Zoom in
            </button>
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-zoom-out"
              @click=${() => {
                app.zoomOut();
                this.#close();
              }}
            >
              Zoom out
            </button>
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-reset-view"
              @click=${() => {
                app.resetView();
                this.#close();
              }}
            >
              Reset view
            </button>
          </div>
        </div>

        <div class="menu-item-wrap position-relative">
          <button
            class=${classMap({ "menu-item": true, btn: true, "btn-sm": true, active: this.#openMenu === "help" })}
            type="button"
            data-testid="menu-help"
            @click=${() => this.#toggle("help")}
          >
            Help
          </button>
          <div
            class=${classMap({
              "dropdown-menu": true,
              "app-menu-dropdown": true,
              show: this.#openMenu === "help",
              "d-block": this.#openMenu === "help",
            })}
          >
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-about"
              @click=${() => {
                app.aboutOpen = true;
                this.#close();
              }}
            >
              About
            </button>
          </div>
        </div>
      </nav>
    `;
  }
}

customElements.define("bld-menu-bar", BldMenuBar);

declare global {
  interface HTMLElementTagNameMap {
    "bld-menu-bar": BldMenuBar;
  }
}
