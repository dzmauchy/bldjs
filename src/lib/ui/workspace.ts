import { LitElement, css, html, nothing } from "lit";
import { AppController } from "$lib/context";
import type { AppState } from "$lib/state";
import "$lib/flow/diagram";

export class BldWorkspace extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;

  static override styles = css`
    :host {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }
    .workspace {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }
    bld-diagram {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }
  `;

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

  protected override render() {
    if (!this.app) {
      return nothing;
    }
    return html`
      <div class="workspace">
        <bld-diagram .app=${this.app}></bld-diagram>
      </div>
    `;
  }
}

customElements.define("bld-workspace", BldWorkspace);

declare global {
  interface HTMLElementTagNameMap {
    "bld-workspace": BldWorkspace;
  }
}
