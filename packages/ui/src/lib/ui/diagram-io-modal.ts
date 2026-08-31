import { LitElement, css, html, nothing } from "lit";
import { AppController } from "$lib/context";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";

export class BldDiagramIoModal extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;
  #saveName = "";

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: contents;
      }
      .saved-list {
        max-height: 16rem;
        overflow: auto;
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
    if (this.app?.ioMode === "save" && this.#saveName === "") {
      this.#saveName = this.app.saveName;
    }
    if (this.app?.ioMode !== "save") {
      this.#saveName = "";
    }
  }

  #bindApp(): void {
    if (!this.app || this.#ctrl?.app === this.app) {
      return;
    }
    this.#ctrl = new AppController(this, this.app);
  }

  #close(): void {
    this.app.closeIo();
  }

  protected override render() {
    const app = this.app;
    if (!app || app.ioMode === "closed") {
      return nothing;
    }
    const saving = app.ioMode === "save";
    return html`
      <div
        class="modal-backdrop fade show"
        role="button"
        tabindex="0"
        data-testid="diagram-io-backdrop"
        @click=${() => this.#close()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            this.#close();
          }
        }}
      ></div>
      <div class="modal fade show d-block" tabindex="-1" role="dialog" data-testid="diagram-io-modal">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${saving ? "Save diagram" : "Open diagram"}</h5>
              <button type="button" class="btn-close" aria-label="Close" @click=${() => this.#close()}></button>
            </div>
            ${saving ? this.#saveBody(app) : this.#openBody(app)}
          </div>
        </div>
      </div>
    `;
  }

  #saveBody(app: AppState) {
    return html`
      <form
        @submit=${(event: Event) => {
          event.preventDefault();
          void app.saveToLibrary(this.#saveName);
        }}
      >
        <div class="modal-body">
          <label class="form-label" for="diagram-save-name">Name</label>
          <input
            id="diagram-save-name"
            class="form-control"
            type="text"
            name="name"
            autocomplete="off"
            data-testid="diagram-save-name"
            .value=${this.#saveName}
            @input=${(event: Event) => {
              this.#saveName = (event.target as HTMLInputElement).value;
            }}
          />
          ${app.ioError
            ? html`<p class="text-warning small mb-0 mt-2" data-testid="diagram-io-error">${app.ioError}</p>`
            : nothing}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-testid="diagram-io-cancel" @click=${() => this.#close()}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" data-testid="diagram-save-confirm">Save</button>
        </div>
      </form>
    `;
  }

  #openBody(app: AppState) {
    return html`
      <div class="modal-body">
        ${app.ioError
          ? html`<p class="text-warning small" data-testid="diagram-io-error">${app.ioError}</p>`
          : nothing}
        ${app.savedDiagrams.length === 0
          ? html`<p class="text-secondary mb-0" data-testid="diagram-library-empty">No saved diagrams.</p>`
          : html`
              <div class="list-group saved-list" data-testid="diagram-library-list">
                ${app.savedDiagrams.map(
                  (item) => html`
                    <div class="list-group-item d-flex align-items-center gap-2" data-testid="saved-diagram" data-diagram-id=${item.id}>
                      <button
                        class="btn btn-link text-start flex-grow-1 p-0 text-decoration-none"
                        type="button"
                        data-testid="saved-diagram-load"
                        @click=${() => {
                          void app.loadFromLibrary(item.id);
                        }}
                      >
                        <span class="d-block">${item.name}</span>
                        <span class="small text-secondary">${item.updatedAt}</span>
                      </button>
                      <button
                        class="btn btn-sm btn-outline-danger"
                        type="button"
                        data-testid="saved-diagram-delete"
                        @click=${() => {
                          void app.deleteFromLibrary(item.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  `,
                )}
              </div>
            `}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-testid="diagram-io-cancel" @click=${() => this.#close()}>
          Close
        </button>
      </div>
    `;
  }
}

customElements.define("bld-diagram-io-modal", BldDiagramIoModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-diagram-io-modal": BldDiagramIoModal;
  }
}
