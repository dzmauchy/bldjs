import { css, html, nothing } from "lit";
import { isNoneId } from "$lib/model";
import type { AppState } from "$lib/state";
import { BldModal } from "./modal";

export class BldInputsModal extends BldModal {
  static override styles = [
    super.styles,
    css`
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

  protected isOpen(): boolean {
    return Boolean(this.app) && !isNoneId(this.app.inputsOpen);
  }

  protected closeModal(): void {
    this.app.closeInputs();
  }

  protected override render() {
    const app = this.app;
    if (!this.isOpen()) {
      return nothing;
    }
    const title = app.blockDef(app.block(app.inputsOpen)?.defId ?? "")?.name ?? "Inputs";
    const inputs = app.blockInputs(app.inputsOpen);
    return this.renderDialog({
      testId: "inputs-modal",
      title: `Configure ${title}`,
      body: html`
        <div class="modal-body">
          ${inputs.length === 0
            ? html`<p class="text-secondary mb-0">This block has no configurable inputs.</p>`
            : inputs.map((input) => this.#renderInput(app.inputsOpen, input))}
        </div>
      `,
      footer: html`
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-testid="inputs-close" @click=${() => this.closeModal()}>
            Done
          </button>
        </div>
      `,
    });
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
