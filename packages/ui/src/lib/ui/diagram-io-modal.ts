import { css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import type { AppState } from "$lib/state";
import { BldModal } from "./modal";

export class BldDiagramIoModal extends BldModal {
  #saveName = "";

  static override styles = css`
    .saved-list {
      max-height: 16rem;
      overflow: auto;
    }
  `;

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
    });
  }

  #saveBody(app: AppState) {
    return html`
      <form
        @submit=${(event: Event) => {
          event.preventDefault();
          void app.io.save(this.#saveName);
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
          ${app.io.error
            ? html`<p class="text-warning small mb-0 mt-2" data-testid="diagram-io-error">${app.io.error}</p>`
            : nothing}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-testid="diagram-io-cancel" @click=${() => this.closeModal()}>
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
        ${app.io.error
          ? html`<p class="text-warning small" data-testid="diagram-io-error">${app.io.error}</p>`
          : nothing}
        ${app.io.savedDiagrams.length === 0
          ? html`<p class="text-secondary mb-0" data-testid="diagram-library-empty">No saved diagrams.</p>`
          : html`
              <div class="list-group saved-list" data-testid="diagram-library-list">
                ${app.io.savedDiagrams.map(
                  (item) => html`
                    <div class="list-group-item d-flex align-items-center gap-2" data-testid="saved-diagram" data-diagram-id=${item.id}>
                      <button
                        class="btn btn-link text-start flex-grow-1 p-0 text-decoration-none"
                        type="button"
                        data-testid="saved-diagram-load"
                        @click=${() => {
                          void app.io.load(item.id);
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
                          void app.io.remove(item.id);
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
        <button type="button" class="btn btn-secondary" data-testid="diagram-io-cancel" @click=${() => this.closeModal()}>
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
