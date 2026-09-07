import { Show, type JSX } from "solid-js";
import { AppHost } from "./app-host";
import "./webawesome";

export interface ModalChrome {
  testId: string;
  title: unknown | (() => unknown);
  body: unknown | (() => unknown);
  footer?: unknown | (() => unknown);
  dialogClass?: string;
  backdropTestId?: string;
  wrapContent?: (content: JSX.Element) => unknown;
}

export abstract class BldModal extends AppHost {
  static override styles: unknown[] = [];

  protected abstract isOpen(): boolean;
  protected abstract closeModal(): void;

  protected renderDialog(opts: ModalChrome): JSX.Element {
    const res = (v: any) => (typeof v === "function" ? v() : v);

    return (
      <Show when={this.isOpen()}>
        {(_) => {
          const title = res(opts.title);
          const body = (
            <>
              <div class="modal-body">{res(opts.body) as JSX.Element}</div>
              {opts.footer ? <div slot="footer" class="modal-footer">{res(opts.footer) as JSX.Element}</div> : null}
            </>
          );
          return (
            <wa-dialog
              class={opts.dialogClass ?? ""}
              label={typeof title === "string" ? title : undefined}
              attr:open=""
              prop:open={true}
              attr:data-testid={opts.testId}
              data-testid={opts.testId}
              on:wa-hide={(e: Event) => e.target === e.currentTarget && this.closeModal()}
            >
              {typeof title !== "string" ? <span slot="label">{title as JSX.Element}</span> : null}
              {opts.wrapContent ? (opts.wrapContent(body) as JSX.Element) : body}
            </wa-dialog>
          );
        }}
      </Show>
    );
  }
}
