import { createEffect, createSignal, For, type JSX } from "solid-js";
import type { AppState } from "$lib/state";
import { BldModal } from "./modal";

export class BldDiagramIoModal extends BldModal {
  static override styles: unknown[] = [];

  readonly #saveName = createSignal("");

  protected isOpen(): boolean {
    return Boolean(this.app) && this.app.io.mode !== "closed";
  }

  protected closeModal(): void {
    this.app?.io.close();
  }

  override render(): JSX.Element {
    const app = this.app;

    createEffect(() => {
      if (app.io.mode === "save" && !this.#saveName[0]()) {
        this.#saveName[1](app.io.saveName);
      } else if (app.io.mode !== "save") {
        this.#saveName[1]("");
      }
    });

    const isSave = () => app.io.mode === "save";

    return this.renderDialog({
      testId: "diagram-io-modal",
      backdropTestId: "diagram-io-backdrop",
      title: () => (isSave() ? "Save diagram" : "Open diagram"),
      body: () =>
        isSave() ? (
          <div class="dialog-field">
            <label class="dialog-label" for="diagram-save-name">Name</label>
            <input
              id="diagram-save-name"
              class="dialog-input"
              type="text"
              name="name"
              autocomplete="off"
              data-testid="diagram-save-name"
              value={this.#saveName[0]()}
              onInput={(e: InputEvent) => this.#saveName[1]((e.target as HTMLInputElement).value)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void app.io.save(this.#saveName[0]());
                }
              }}
            />
            {app.io.error ? (
              <p class="text-warning small dialog-error" data-testid="diagram-io-error">{app.io.error}</p>
            ) : null}
          </div>
        ) : (
          <>
            {app.io.error ? <p class="text-warning small" data-testid="diagram-io-error">{app.io.error}</p> : null}
            {app.io.savedDiagrams.length === 0 ? (
              <p class="text-secondary" data-testid="diagram-library-empty">No saved diagrams.</p>
            ) : (
              <div class="saved-list" data-testid="diagram-library-list">
                <For each={app.io.savedDiagrams}>
                  {(item) => (
                    <div class="saved-diagram-item" data-testid="saved-diagram" data-diagram-id={item.id}>
                      <button class="saved-diagram-load" type="button" data-testid="saved-diagram-load" onClick={() => void app.io.load(item.id)}>
                        <span class="saved-diagram-name">{item.name}</span>
                        <span class="small text-secondary">{item.updatedAt}</span>
                      </button>
                      <wa-button variant="danger" appearance="outlined" size="small" attr:data-testid="saved-diagram-delete" data-testid="saved-diagram-delete" on:click={() => void app.io.remove(item.id)}>
                        Delete
                      </wa-button>
                    </div>
                  )}
                </For>
              </div>
            )}
          </>
        ),
      footer: () =>
        isSave() ? (
          <>
            <wa-button variant="neutral" attr:data-testid="diagram-io-cancel" data-testid="diagram-io-cancel" on:click={() => this.closeModal()}>
              Cancel
            </wa-button>
            <wa-button variant="brand" attr:data-testid="diagram-save-confirm" data-testid="diagram-save-confirm" on:click={() => void app.io.save(this.#saveName[0]())}>
              Save
            </wa-button>
          </>
        ) : (
          <wa-button variant="neutral" attr:data-testid="diagram-io-cancel" data-testid="diagram-io-cancel" on:click={() => this.closeModal()}>
            Close
          </wa-button>
        ),
    });
  }
}

customElements.define("bld-diagram-io-modal", BldDiagramIoModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-diagram-io-modal": BldDiagramIoModal;
  }
}
