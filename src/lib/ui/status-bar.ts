import { LitElement, css, html, nothing } from "lit";
import { AppController } from "$lib/context";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";

export class BldStatusBar extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: block;
        height: 28px;
        flex: 0 0 28px;
      }
      .app-statusbar {
        height: 28px;
        background: #1b1f22;
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

  #countLabel(count: number, singular: string, plural: string): string {
    return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
  }

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    return html`
      <footer class="app-statusbar border-top d-flex align-items-center px-3 small text-secondary">
        <span class="me-3" data-testid="status-blocks">${this.#countLabel(app.blocks.length, "block", "blocks")}</span>
        <span class="me-3" data-testid="status-links">${this.#countLabel(app.links.length, "link", "links")}</span>
        <span class="me-3">${this.#countLabel(app.sources.length, "model", "models")}</span>
        <span class="me-3" data-testid="status-zoom">${app.zoomPercent()}%</span>
        <span class="ms-auto">
          ${app.linkingFrom
            ? "Click an input handle to ground its type · Esc cancels"
            : "Click or drag output → input handles · scroll to zoom"}
        </span>
      </footer>
    `;
  }
}

customElements.define("bld-status-bar", BldStatusBar);

declare global {
  interface HTMLElementTagNameMap {
    "bld-status-bar": BldStatusBar;
  }
}
