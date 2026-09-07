import { html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { renderBrandSvg } from "$lib/flow/icons";
import { AppHost } from "./app-host";
import "./block-icon";

export class BldToolbar extends AppHost {
  #menuOpen = false;

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("pointerdown", this.#onWindowPointerDown);
  }

  override disconnectedCallback(): void {
    window.removeEventListener("pointerdown", this.#onWindowPointerDown);
    super.disconnectedCallback();
  }

  #close(): void {
    this.#menuOpen = false;
    this.requestUpdate();
  }

  #toggleMenu(): void {
    this.#menuOpen = !this.#menuOpen;
    this.requestUpdate();
  }

  #onWindowPointerDown = (event: PointerEvent): void => {
    if (!this.#menuOpen) {
      return;
    }
    const path = event.composedPath();
    if (path.includes(this)) {
      return;
    }
    this.#menuOpen = false;
    this.requestUpdate();
  };

  #importXml(): void {
    this.#close();
    const input = this.renderRoot.querySelector('[data-testid="import-xml-input"]');
    if (input instanceof HTMLInputElement) {
      input.value = "";
      input.click();
    }
  }

  async #onImportFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    const xml = await file.text();
    this.app.io.loadXml(xml);
  }

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    return html`
      <nav class="app-toolbar border-bottom d-flex align-items-center px-2" data-testid="app-toolbar">
        <span class="app-brand me-2" title="Bld" data-testid="app-brand">${unsafeSVG(renderBrandSvg())}</span>

        <button
          class=${classMap({
            "toolbar-btn": true,
            "toolbar-palette-btn": true,
            btn: true,
            "btn-sm": true,
            active: app.paletteOpen,
          })}
          type="button"
          title="Blocks"
          aria-label="Blocks"
          aria-pressed=${app.paletteOpen ? "true" : "false"}
          data-testid="toolbar-palette"
          @click=${() => app.togglePalette()}
        >
          <bld-block-icon name="list"></bld-block-icon>
        </button>

        <button
          class=${classMap({
            "toolbar-btn": true,
            "toolbar-run-btn": !app.run.busy(),
            "toolbar-stop-btn": app.run.busy(),
            btn: true,
            "btn-sm": true,
          })}
          type="button"
          title=${app.run.busy() ? "Stop" : "Run"}
          aria-label=${app.run.busy() ? "Stop" : "Run"}
          data-testid=${app.run.busy() ? "toolbar-stop" : "toolbar-run"}
          @click=${() => {
            if (app.run.busy()) {
              app.run.stop();
              return;
            }
            void app.run.start();
          }}
        >
          <bld-block-icon name=${app.run.busy() ? "stop" : "run"}></bld-block-icon>
        </button>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          hidden
          data-testid="import-xml-input"
          @change=${(event: Event) => this.#onImportFile(event)}
        />

        <div class="ms-auto position-relative">
          <button
            class=${classMap({
              "toolbar-btn": true,
              "toolbar-menu-btn": true,
              btn: true,
              "btn-sm": true,
              active: this.#menuOpen,
            })}
            type="button"
            title="Menu"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded=${this.#menuOpen ? "true" : "false"}
            data-testid="toolbar-menu"
            @click=${() => this.#toggleMenu()}
          >
            <bld-block-icon name="menu"></bld-block-icon>
          </button>
          <div
            class=${classMap({
              "dropdown-menu": true,
              "dropdown-menu-end": true,
              "app-menu-dropdown": true,
              show: this.#menuOpen,
              "d-block": this.#menuOpen,
            })}
            role="menu"
            data-testid="toolbar-menu-dropdown"
          >
            <div class="dropdown-header" data-testid="menu-file">File</div>
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
              data-testid="menu-save-diagram"
              @click=${() => {
                app.io.openSave();
                this.#close();
              }}
            >
              Save…
            </button>
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-open-diagram"
              @click=${() => {
                void app.io.openLibrary();
                this.#close();
              }}
            >
              Open…
            </button>
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-import-xml"
              @click=${() => this.#importXml()}
            >
              Import XML…
            </button>
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-export-xml"
              @click=${() => {
                app.io.exportFile();
                this.#close();
              }}
            >
              Export XML
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
            <div class="dropdown-header" data-testid="menu-catalogs">Catalogs</div>
            ${app.catalogChoices().map(
              (catalog) => html`
                <button
                  class=${classMap({
                    "dropdown-item": true,
                    "d-flex": true,
                    "align-items-center": true,
                    "gap-2": true,
                    active: catalog.selected,
                  })}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked=${catalog.selected ? "true" : "false"}
                  data-testid=${`menu-catalog-${catalog.file}`}
                  @click=${() => app.toggleCatalog(catalog.file)}
                >
                  <span class="catalog-check" aria-hidden="true">${catalog.selected ? "✓" : ""}</span>
                  ${catalog.name}
                </button>
              `,
            )}

            <div class="dropdown-divider"></div>
            <div class="dropdown-header" data-testid="menu-hardware">Hardware</div>
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-connect-mcu"
              ?disabled=${!app.deploy.available() || app.deploy.connecting}
              @click=${() => {
                void app.deploy.connect();
                this.#close();
              }}
            >
              ${app.deploy.connected ? "MCU connected" : "Connect MCU…"}
            </button>
            <button
              class="dropdown-item"
              type="button"
              data-testid="menu-deploy-mcu"
              ?disabled=${!app.deploy.available() || app.deploy.connecting}
              @click=${() => {
                void app.deploy.deploy();
                this.#close();
              }}
            >
              Deploy MCU wasm
            </button>
            <div class="dropdown-divider"></div>
            <div class="dropdown-header" data-testid="menu-view">View</div>
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

            <div class="dropdown-divider"></div>
            <div class="dropdown-header" data-testid="menu-help">Help</div>
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

customElements.define("bld-toolbar", BldToolbar);

declare global {
  interface HTMLElementTagNameMap {
    "bld-toolbar": BldToolbar;
  }
}
