import { html, nothing } from "lit";
import { AppHost } from "./app-host";
import "$lib/flow/diagram";

export class BldWorkspace extends AppHost {

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
