import { html, nothing } from "lit";
import type { PropertyValues } from "lit";
import type { AppState } from "$lib/state";
import { BldModal } from "./modal";

export class BldDiagramIoModal extends BldModal {
  #saveName = "";

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (this.app?.io.mode === "save" && this.#saveName === "") {
      this.#saveName = this.app.io.saveName;
    }
    if (this.app?.io.mode !== "save") {
      this.#saveName = "";
    }
  }

  protected isOpen(): boolean {
    return Boolean(this.app) && this.app.io.mode !== "closed";
  }

  protected closeModal(): void {
    this.app.io.close();
  }

  protected override render() {
    const app = this.app;
    if (!this.isOpen()) {
      return nothing;
    }
    const saving = app.io.mode === "save";
    return this.renderDialog({
      testId: "diagram-io-modal",
      backdropTestId: "diagram-io-backdrop",
      title: saving ? "Save diagram" : "Open diagram",
      body: saving ? this.#saveBody(app) : this.#openBody(app),
      footer: saving ? this.#saveFooter(app) : this.#openFooter(),
    });
  }

  #saveBody(app: AppState) {
    return html`
      <div class="dialog-field">
        <label class="dialog-label" for="diagram-save-name">Name</label>
        <input
          id="diagram-save-name"
          class="dialog-input"
          type="text"
          name="name"
          autocomplete="off"
          data-testid="diagram-save-name"
          .value=${this.#saveName}
          @input=${(event: Event) => {
            this.#saveName = (event.target as HTMLInputElement).value;
          }}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void app.io.save(this.#saveName);
            }
          }}
        />
        ${app.io.error
          ? html`<p class="text-warning small dialog-error" data-testid="diagram-io-error">${app.io.error}</p>`
          : nothing}
      </div>
    `;
  }

  #saveFooter(app: AppState) {
    return html`
      <wa-button variant="neutral" data-testid="diagram-io-cancel" @click=${() => this.closeModal()}>
        Cancel
      </wa-button>
      <wa-button variant="brand" data-testid="diagram-save-confirm" @click=${() => void app.io.save(this.#saveName)}>
        Save
      </wa-button>
    `;
  }

  #openBody(app: AppState) {
    return html`
      ${app.io.error
        ? html`<p class="text-warning small" data-testid="diagram-io-error">${app.io.error}</p>`
        : nothing}
      ${app.io.savedDiagrams.length === 0
        ? html`<p class="text-secondary" data-testid="diagram-library-empty">No saved diagrams.</p>`
        : html`
            <div class="saved-list" data-testid="diagram-library-list">
              ${app.io.savedDiagrams.map(
                (item) => html`
                  <div class="saved-diagram-item" data-testid="saved-diagram" data-diagram-id=${item.id}>
                    <button
                      class="saved-diagram-load"
                      type="button"
                      data-testid="saved-diagram-load"
                      @click=${() => {
                        void app.io.load(item.id);
                      }}
                    >
                      <span class="saved-diagram-name">${item.name}</span>
                      <span class="small text-secondary">${item.updatedAt}</span>
                    </button>
                    <wa-button
                      variant="danger"
                      appearance="outlined"
                      size="small"
                      data-testid="saved-diagram-delete"
                      @click=${() => {
                        void app.io.remove(item.id);
                      }}
                    >
                      Delete
                    </wa-button>
                  </div>
                `,
              )}
            </div>
          `}
    `;
  }

  #openFooter() {
    return html`
      <wa-button variant="neutral" data-testid="diagram-io-cancel" @click=${() => this.closeModal()}>
        Close
      </wa-button>
    `;
  }
}

customElements.define("bld-diagram-io-modal", BldDiagramIoModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-diagram-io-modal": BldDiagramIoModal;
  }
}
