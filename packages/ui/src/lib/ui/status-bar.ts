import { html, nothing } from "lit";
import { AppHost } from "./app-host";

export class BldStatusBar extends AppHost {

  #countLabel(count: number, singular: string, plural: string): string {
    return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
  }

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    return html`
      <footer class="app-statusbar">
        <span data-testid="status-blocks">${this.#countLabel(app.blocks.length, "block", "blocks")}</span>
        <span data-testid="status-links">${this.#countLabel(app.links.length, "link", "links")}</span>
        <span>${this.#countLabel(app.sources.length, "model", "models")}</span>
        <span data-testid="status-zoom">${app.zoomPercent()}%</span>
        <span data-testid="status-run">${app.run.running ? "Running" : "Stopped"}</span>
        ${app.run.error ? html`<span class="status-error" data-testid="status-run-error">${app.run.error}</span>` : nothing}
        ${app.io.error ? html`<span class="status-error" data-testid="status-io-error">${app.io.error}</span>` : nothing}
        <span class="status-hint">
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
