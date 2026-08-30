import { LitElement, css, html, nothing } from "lit";
import { AppController } from "$lib/context";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";

export class BldAboutModal extends LitElement {
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
    this.app.aboutOpen = false;
  }

  protected override render() {
    const app = this.app;
    if (!app?.aboutOpen) {
      return nothing;
    }
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
      <div class="modal fade show d-block" tabindex="-1" role="dialog" data-testid="about-modal">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">About Bld</h5>
              <button type="button" class="btn-close" aria-label="Close" @click=${() => this.#close()}></button>
            </div>
            <div class="modal-body">
              <p class="mb-2">
                A block diagram: drag icons from the palette, then ground inputs by wiring handles to infer types.
              </p>
              <ul class="small mb-0">
                <li>Scroll to zoom toward the cursor</li>
                <li>Drag empty space to pan</li>
                <li>Drag a placed block to move it</li>
                <li>Click or drag from an output handle to an input handle to ground a type</li>
                <li>Run builds the wasm assembly from the wired blocks (SolutionBuilder)</li>
                <li>Each Timer ticks with setInterval (a worker thread when the page is cross-origin isolated)</li>
                <li>After Run, Chart on Oscilloscope reads samples from that buffer</li>
                <li>Delete or Backspace removes the selection</li>
                <li>Ctrl/Cmd + 0 resets the view</li>
              </ul>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" @click=${() => this.#close()}>Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("bld-about-modal", BldAboutModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-about-modal": BldAboutModal;
  }
}
