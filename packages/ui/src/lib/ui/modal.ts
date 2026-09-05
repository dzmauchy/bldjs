import { css, html, nothing, type TemplateResult } from "lit";
import { bootstrapStyles } from "./bootstrap";
import { AppHost } from "./app-host";

export interface ModalChrome {
  testId: string;
  title: unknown;
  body: unknown;
  footer?: unknown;
  dialogClass?: string;
  backdropTestId?: string;
  wrapContent?: (content: TemplateResult) => unknown;
}

/** Bootstrap dialog shell shared by about / inputs / save-open. */
export abstract class BldModal extends AppHost {
  /** Subclasses that add styles must include `super.styles` so the overlay chrome stays adopted. */
  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: contents;
      }
    `,
  ];

  protected abstract isOpen(): boolean;
  protected abstract closeModal(): void;

  protected renderBackdrop(testId?: string): TemplateResult {
    return html`
      <div
        class="modal-backdrop fade show"
        role="button"
        tabindex="0"
        data-testid=${testId ?? nothing}
        @click=${() => this.closeModal()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            this.closeModal();
          }
        }}
      ></div>
    `;
  }

  protected renderDialog(options: ModalChrome): TemplateResult | typeof nothing {
    if (!this.isOpen()) {
      return nothing;
    }
    const content = html`
      <div class="modal-header">
        <h5 class="modal-title">${options.title}</h5>
        <button type="button" class="btn-close" aria-label="Close" @click=${() => this.closeModal()}></button>
      </div>
      ${options.body}
      ${options.footer ?? nothing}
    `;
    return html`
      ${this.renderBackdrop(options.backdropTestId)}
      <div class="modal fade show d-block" tabindex="-1" role="dialog" data-testid=${options.testId}>
        <div class=${options.dialogClass ?? "modal-dialog modal-dialog-centered"}>
          <div class="modal-content">${options.wrapContent ? options.wrapContent(content) : content}</div>
        </div>
      </div>
    `;
  }
}
