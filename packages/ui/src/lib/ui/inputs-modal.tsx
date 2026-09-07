import { For, Show, type JSX } from "solid-js";
import { isNoneId } from "$lib/model";
import type { AppState } from "$lib/state";
import { BldModal } from "./modal";

function inputSuffix(defId: string, name: string): string {
  if (name === "period" || name === "m") {
    return " ms";
  }
  if (defId === "scope" && name === "n") {
    return " s";
  }
  return "";
}

export class BldInputsModal extends BldModal {
  static override styles: unknown[] = [];

  protected isOpen(): boolean {
    return Boolean(this.app) && !isNoneId(this.app.inputsOpen);
  }

  protected closeModal(): void {
    this.app?.closeInputs();
  }

  override render(): JSX.Element {
    const app = this.app;

    return this.renderDialog({
      testId: "inputs-modal",
      title: () => {
        const id = app.inputsOpen;
        const block = app.block(id);
        const title = app.blockDef(block?.defId ?? "")?.name ?? "Inputs";
        return `Configure ${title}`;
      },
      body: () => {
        const id = app.inputsOpen;
        const inputs = app.blockInputs(id);
        return (
          <div>
            <Show
              when={inputs.length > 0}
              fallback={<p class="text-secondary">This block has no configurable inputs.</p>}
            >
              <For each={inputs}>
                {(input) => this.#renderInput(app, id, input)}
              </For>
            </Show>
          </div>
        );
      },
      footer: (
        <wa-button
          variant="brand"
          attr:data-testid="inputs-close"
          data-testid="inputs-close"
          on:click={() => this.closeModal()}
        >
          Done
        </wa-button>
      ),
    });
  }

  #renderInput(
    app: AppState,
    blockId: number,
    input: ReturnType<AppState["blockInputs"]>[number],
  ): JSX.Element {
    const { def } = input;
    const label = def.description ?? def.name;
    const defId = app.block(blockId)?.defId ?? "";
    const isRange = def.kind === "integer-range-parameter" || def.kind === "double-range-parameter";
    const step = def.step ?? (def.kind === "double-range-parameter" ? 0.1 : isRange ? 1 : undefined);
    const type = isRange ? "range" : def.kind === "text-parameter" ? "text" : "number";
    const getValue = () => app.blockInputs(blockId).find((i) => i.def.name === def.name)?.value ?? def.default ?? "";

    return (
      <div class="input-row" data-testid={`input-row-${def.name}`}>
        <div class="input-label">
          <span>{label}</span>
          {isRange ? (
            <span class="input-value" data-testid={`input-value-${def.name}`}>
              {getValue()}{inputSuffix(defId, def.name)}
            </span>
          ) : null}
        </div>
        <input
          id={`input-${def.name}`}
          class={isRange ? undefined : "dialog-input"}
          type={type}
          min={def.min ?? (isRange ? 0 : undefined)}
          max={def.max ?? (isRange ? 100 : undefined)}
          step={step}
          value={getValue()}
          data-testid={`input-${isRange ? "range" : "field"}-${def.name}`}
          onPointerDown={(event: PointerEvent) => event.stopPropagation()}
          onInput={(event: InputEvent) => {
            app.setBlockParameter(blockId, def.name, (event.target as HTMLInputElement).value);
          }}
        />
      </div>
    );
  }
}

customElements.define("bld-inputs-modal", BldInputsModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-inputs-modal": BldInputsModal;
  }
}
