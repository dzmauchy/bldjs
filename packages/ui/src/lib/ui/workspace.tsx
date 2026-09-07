import type { JSX } from "solid-js";
import { AppHost } from "./app-host";
import "$lib/flow/diagram";

export class BldWorkspace extends AppHost {
  override render(): JSX.Element {
    const app = this.app;
    return (
      <div class="workspace">
        <bld-diagram prop:app={app}></bld-diagram>
      </div>
    );
  }
}

customElements.define("bld-workspace", BldWorkspace);

declare global {
  interface HTMLElementTagNameMap {
    "bld-workspace": BldWorkspace;
  }
}
