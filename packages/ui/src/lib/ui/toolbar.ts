import { html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { renderBrandSvg } from "$lib/flow/icons";
import { AppHost } from "./app-host";
import "./block-icon";
import "./webawesome";

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
      <nav class="app-toolbar" data-testid="app-toolbar">
        <span class="app-brand" title="Bld" data-testid="app-brand">${unsafeSVG(renderBrandSvg())}</span>

        <button
          class=${classMap({
            "toolbar-btn": true,
            "toolbar-palette-btn": true,
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

        <div class="toolbar-menu-wrapper">
          <wa-dropdown
            placement="bottom-end"
            class=${classMap({ show: this.#menuOpen })}
            data-testid="toolbar-menu-dropdown"
            ?open=${this.#menuOpen}
            @wa-hide=${() => this.#close()}
          >
            <button
              slot="trigger"
              class=${classMap({
                "toolbar-btn": true,
                "toolbar-menu-btn": true,
                active: this.#menuOpen,
              })}
              type="button"
              title="Menu"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded=${this.#menuOpen ? "true" : "false"}
              data-testid="toolbar-menu"
              @click=${(event: MouseEvent) => {
                event.stopPropagation();
                this.#toggleMenu();
              }}
            >
              <bld-block-icon name="menu"></bld-block-icon>
            </button>
            ${this.#menuOpen
              ? html`
                  <div class="menu-header" data-testid="menu-file">File</div>
                  <wa-dropdown-item
                    data-testid="menu-new-canvas"
                    @click=${() => {
                      app.clearCanvas();
                      this.#close();
                    }}
                  >
                    New canvas
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    data-testid="menu-save-diagram"
                    @click=${() => {
                      app.io.openSave();
                      this.#close();
                    }}
                  >
                    Save…
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    data-testid="menu-open-diagram"
                    @click=${() => {
                      void app.io.openLibrary();
                      this.#close();
                    }}
                  >
                    Open…
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    data-testid="menu-import-xml"
                    @click=${() => this.#importXml()}
                  >
                    Import XML…
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    data-testid="menu-export-xml"
                    @click=${() => {
                      app.io.exportFile();
                      this.#close();
                    }}
                  >
                    Export XML
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    data-testid="menu-delete-selected"
                    @click=${() => {
                      app.deleteSelected();
                      this.#close();
                    }}
                  >
                    Delete selected
                  </wa-dropdown-item>
                  <wa-divider></wa-divider>
                  <div class="menu-header" data-testid="menu-catalogs">Catalogs</div>
                  ${app.catalogChoices().map(
                    (catalog) => html`
                      <wa-dropdown-item
                        type="checkbox"
                        ?checked=${catalog.selected}
                        aria-checked=${catalog.selected ? "true" : "false"}
                        data-testid=${`menu-catalog-${catalog.file}`}
                        @click=${(event: Event) => {
                          event.stopPropagation();
                          app.toggleCatalog(catalog.file);
                        }}
                      >
                        ${catalog.name}
                      </wa-dropdown-item>
                    `,
                  )}

                  <wa-divider></wa-divider>
                  <div class="menu-header" data-testid="menu-hardware">Hardware</div>
                  <wa-dropdown-item
                    data-testid="menu-connect-mcu"
                    ?disabled=${!app.deploy.available() || app.deploy.connecting}
                    @click=${() => {
                      void app.deploy.connect();
                      this.#close();
                    }}
                  >
                    ${app.deploy.connected ? "MCU connected" : "Connect MCU…"}
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    data-testid="menu-deploy-mcu"
                    ?disabled=${!app.deploy.available() || app.deploy.connecting}
                    @click=${() => {
                      void app.deploy.deploy();
                      this.#close();
                    }}
                  >
                    Deploy MCU wasm
                  </wa-dropdown-item>
                  <wa-divider></wa-divider>
                  <div class="menu-header" data-testid="menu-view">View</div>
                  <wa-dropdown-item
                    data-testid="menu-zoom-in"
                    @click=${() => {
                      app.zoomIn();
                      this.#close();
                    }}
                  >
                    Zoom in
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    data-testid="menu-zoom-out"
                    @click=${() => {
                      app.zoomOut();
                      this.#close();
                    }}
                  >
                    Zoom out
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    data-testid="menu-reset-view"
                    @click=${() => {
                      app.resetView();
                      this.#close();
                    }}
                  >
                    Reset view
                  </wa-dropdown-item>

                  <wa-divider></wa-divider>
                  <div class="menu-header" data-testid="menu-help">Help</div>
                  <wa-dropdown-item
                    data-testid="menu-about"
                    @click=${() => {
                      app.aboutOpen = true;
                      this.#close();
                    }}
                  >
                    About
                  </wa-dropdown-item>
                `
              : nothing}
          </wa-dropdown>
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
