import { css, html, nothing } from "lit";
import { AppHost } from "./app-host";
import "$lib/flow/diagram";

export class BldWorkspace extends AppHost {
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
