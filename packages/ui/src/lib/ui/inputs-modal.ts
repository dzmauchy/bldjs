import { LitElement, css, html, nothing } from "lit";
import { AppController } from "$lib/context";
import { isNoneId } from "$lib/model";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";

export class BldInputsModal extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: contents;
      }
      .input-row {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .input-label {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        font-size: 0.875rem;
      }
      .input-value {
        font-family: var(--bs-font-monospace, ui-monospace, monospace);
        color: var(--bs-info, #0dcaf0);
      }
      input[type="range"] {
        width: 100%;
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
  }

  #bindApp(): void {
    if (!this.app || this.#ctrl?.app === this.app) {
      return;
    }
    this.#ctrl = new AppController(this, this.app);
  }

  #close(): void {
    this.app.closeInputs();
  }

  protected override render() {
    const app = this.app;
    if (!app || isNoneId(app.inputsOpen)) {
      return nothing;
    }
    const title = app.blockDef(app.block(app.inputsOpen)?.defId ?? "")?.name ?? "Inputs";
    const inputs = app.blockInputs(app.inputsOpen);
    return html`
      <div
        class="modal-backdrop fade show"
        role="button"
        tabindex="0"
        @click=${() => this.#close()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            this.#close();
          }
        }}
      ></div>
      <div class="modal fade show d-block" tabindex="-1" role="dialog" data-testid="inputs-modal">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Configure ${title}</h5>
              <button type="button" class="btn-close" aria-label="Close" @click=${() => this.#close()}></button>
            </div>
            <div class="modal-body">
              ${inputs.length === 0
                ? html`<p class="text-secondary mb-0">This block has no configurable inputs.</p>`
                : inputs.map((input) => this.#renderInput(app.inputsOpen, input))}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" data-testid="inputs-close" @click=${() => this.#close()}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  #renderInput(blockId: number, input: ReturnType<AppState["blockInputs"]>[number]) {
    const app = this.app;
    const { def, value } = input;
    const label = def.description ?? def.name;
    if (def.kind === "integer-range-parameter" || def.kind === "double-range-parameter") {
      const min = def.min ?? 0;
      const max = def.max ?? 100;
      const step = def.step ?? (def.kind === "double-range-parameter" ? 0.1 : 1);
      return html`
        <div class="input-row mb-3" data-testid=${`input-row-${def.name}`}>
          <div class="input-label">
            <span>${label}</span>
            <span class="input-value" data-testid=${`input-value-${def.name}`}>${value}${def.name === "period" ? " ms" : ""}</span>
          </div>
          <input
            type="range"
            min=${min}
            max=${max}
            step=${step}
            .value=${value}
            data-testid=${`input-range-${def.name}`}
            @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
            @input=${(event: Event) => {
              const next = (event.target as HTMLInputElement).value;
              app.setBlockParameter(blockId, def.name, next);
            }}
          />
        </div>
      `;
    }
    const type =
      def.kind === "date-parameter"
        ? "date"
        : def.kind === "time-parameter"
          ? "time"
          : def.kind === "date-time-parameter"
            ? "datetime-local"
            : def.kind === "text-parameter"
              ? "text"
              : "number";
    return html`
      <div class="input-row mb-3" data-testid=${`input-row-${def.name}`}>
        <label class="input-label" for=${`input-${def.name}`}>
          <span>${label}</span>
        </label>
        <input
          id=${`input-${def.name}`}
          class="form-control form-control-sm"
          type=${type}
          .value=${value}
          min=${def.min ?? nothing}
          max=${def.max ?? nothing}
          step=${def.step ?? nothing}
          data-testid=${`input-field-${def.name}`}
          @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
          @input=${(event: Event) => {
            const next = (event.target as HTMLInputElement).value;
            app.setBlockParameter(blockId, def.name, next);
          }}
        />
      </div>
    `;
  }
}

customElements.define("bld-inputs-modal", BldInputsModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-inputs-modal": BldInputsModal;
  }
}
