import { createSignal, For, Show, type JSX } from "solid-js";
import { renderBrandSvg } from "$lib/flow/icons";
import { AppHost } from "./app-host";
import "./block-icon";
import "./webawesome";

export class BldToolbar extends AppHost {
  readonly #menuOpen = createSignal(false);

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("pointerdown", this.#onWindowPointerDown);
  }

  override disconnectedCallback(): void {
    window.removeEventListener("pointerdown", this.#onWindowPointerDown);
    super.disconnectedCallback();
  }

  #close = (): void => {
    this.#menuOpen[1](false);
  };

  #onWindowPointerDown = (e: PointerEvent): void => {
    if (this.#menuOpen[0]() && !e.composedPath().includes(this)) this.#close();
  };

  #importXml(): void {
    this.#close();
    const input = this.querySelector<HTMLInputElement>('[data-testid="import-xml-input"]');
    if (input) {
      input.value = "";
      input.click();
    }
  }

  async #onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (file) this.app.io.loadXml(await file.text());
  }

  override render(): JSX.Element {
    const app = this.app;
    if (!app) return null;

    const [open, setOpen] = this.#menuOpen;
    const item = (id: string, label: string, action: () => void, disabled = false) => (
      <wa-dropdown-item
        attr:data-testid={id}
        data-testid={id}
        prop:disabled={disabled}
        attr:disabled={disabled ? "" : undefined}
        onClick={() => { action(); this.#close(); }}
      >
        {label}
      </wa-dropdown-item>
    );

    return (
      <nav class="app-toolbar" data-testid="app-toolbar">
        <span class="app-brand" title="Bld" data-testid="app-brand" innerHTML={renderBrandSvg()} />

        <button
          class={`toolbar-btn toolbar-palette-btn${app.paletteOpen ? " active" : ""}`}
          type="button"
          title="Blocks"
          aria-label="Blocks"
          aria-pressed={app.paletteOpen ? "true" : "false"}
          data-testid="toolbar-palette"
          onClick={() => app.togglePalette()}
        >
          <bld-block-icon name="list"></bld-block-icon>
        </button>

        <button
          class={`toolbar-btn ${app.run.busy() ? "toolbar-stop-btn" : "toolbar-run-btn"}`}
          type="button"
          title={app.run.busy() ? "Stop" : "Run"}
          aria-label={app.run.busy() ? "Stop" : "Run"}
          data-testid={app.run.busy() ? "toolbar-stop" : "toolbar-run"}
          onClick={() => {
            if (app.run.busy()) app.run.stop();
            else void app.run.start();
          }}
        >
          <bld-block-icon name={app.run.busy() ? "stop" : "run"}></bld-block-icon>
        </button>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          hidden
          data-testid="import-xml-input"
          onChange={(e) => this.#onImportFile(e)}
        />

        <div class="toolbar-menu-wrapper">
          <wa-dropdown
            placement="bottom-end"
            class={open() ? "show" : ""}
            data-testid="toolbar-menu-dropdown"
            attr:open={open() ? "" : undefined}
            prop:open={open()}
            on:wa-select={(e: CustomEvent) => {
              if ((e.detail?.item as any)?.type === "checkbox") e.preventDefault();
            }}
            on:wa-hide={this.#close}
          >
            <button
              slot="trigger"
              class={`toolbar-btn toolbar-menu-btn${open() ? " active" : ""}`}
              type="button"
              title="Menu"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={open() ? "true" : "false"}
              data-testid="toolbar-menu"
              onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
            >
              <bld-block-icon name="menu"></bld-block-icon>
            </button>
            <Show when={open()}>
              {(_) => (
                <>
                  <div class="menu-header" data-testid="menu-file">File</div>
                  {item("menu-new-canvas", "New canvas", () => app.clearCanvas())}
                  {item("menu-save-diagram", "Save…", () => app.io.openSave())}
                  {item("menu-open-diagram", "Open…", () => void app.io.openLibrary())}
                  {item("menu-import-xml", "Import XML…", () => this.#importXml())}
                  {item("menu-export-xml", "Export XML", () => app.io.exportFile())}
                  {item("menu-delete-selected", "Delete selected", () => app.deleteSelected())}

                  <wa-divider></wa-divider>
                  <div class="menu-header" data-testid="menu-catalogs">Catalogs</div>
                  <For each={app.catalogChoices()}>
                    {(catalog) => (
                      <wa-dropdown-item
                        type="checkbox"
                        attr:checked={catalog.selected ? "" : undefined}
                        prop:checked={catalog.selected}
                        aria-checked={catalog.selected ? "true" : "false"}
                        attr:data-testid={`menu-catalog-${catalog.file}`}
                        data-testid={`menu-catalog-${catalog.file}`}
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation();
                          app.toggleCatalog(catalog.file);
                        }}
                      >
                        {catalog.name}
                      </wa-dropdown-item>
                    )}
                  </For>

                  <wa-divider></wa-divider>
                  <div class="menu-header" data-testid="menu-hardware">Hardware</div>
                  {item(
                    "menu-connect-mcu",
                    app.deploy.connected ? "MCU connected" : "Connect MCU…",
                    () => void app.deploy.connect(),
                    !app.deploy.available() || app.deploy.connecting,
                  )}
                  {item(
                    "menu-deploy-mcu",
                    "Deploy MCU wasm",
                    () => void app.deploy.deploy(),
                    !app.deploy.available() || app.deploy.connecting,
                  )}

                  <wa-divider></wa-divider>
                  <div class="menu-header" data-testid="menu-view">View</div>
                  {item("menu-zoom-in", "Zoom in", () => app.zoomIn())}
                  {item("menu-zoom-out", "Zoom out", () => app.zoomOut())}
                  {item("menu-reset-view", "Reset view", () => app.resetView())}

                  <wa-divider></wa-divider>
                  <div class="menu-header" data-testid="menu-help">Help</div>
                  {item("menu-about", "About", () => { app.aboutOpen = true; })}
                </>
              )}
            </Show>
          </wa-dropdown>
        </div>
      </nav>
    );
  }
}

customElements.define("bld-toolbar", BldToolbar);

declare global {
  interface HTMLElementTagNameMap {
    "bld-toolbar": BldToolbar;
  }
}
