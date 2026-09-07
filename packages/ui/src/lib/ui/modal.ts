import { html, nothing, type TemplateResult } from "lit";
import { AppHost } from "./app-host";
import "./webawesome";

export interface ModalChrome {
  testId: string;
  title: unknown;
  body: unknown;
  footer?: unknown;
  dialogClass?: string;
  backdropTestId?: string;
  wrapContent?: (content: TemplateResult) => unknown;
}

/** Web Awesome dialog shell shared by about / inputs / save-open. */
export abstract class BldModal extends AppHost {
  protected abstract isOpen(): boolean;
  protected abstract closeModal(): void;

  protected renderDialog(options: ModalChrome): TemplateResult | typeof nothing {
    if (!this.isOpen()) {
      return nothing;
    }
    const bodyContent = html`
      <div class="modal-body">
        ${options.body}
      </div>
      ${options.footer ? html`<div slot="footer" class="modal-footer">${options.footer}</div>` : nothing}
    `;
    const content = options.wrapContent ? options.wrapContent(bodyContent) : bodyContent;
    return html`
      <wa-dialog
        class=${options.dialogClass ?? ""}
        label=${typeof options.title === "string" ? options.title : nothing}
        ?open=${this.isOpen()}
        data-testid=${options.testId}
        @wa-hide=${(event: Event) => {
          if (event.target === event.currentTarget) {
            this.closeModal();
          }
        }}
      >
        ${typeof options.title !== "string" ? html`<span slot="label">${options.title}</span>` : nothing}
        ${content}
      </wa-dialog>
    `;
  }
}
