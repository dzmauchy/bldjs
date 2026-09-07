import type { JSX } from "solid-js";
import { AppHost } from "./app-host";

function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export class BldStatusBar extends AppHost {
  override render(): JSX.Element {
    const app = this.reactiveApp;
    if (!app) {
      return null;
    }
    return (
      <footer class="app-statusbar">
        <span data-testid="status-blocks">{countLabel(app.blocks.length, "block", "blocks")}</span>
        <span data-testid="status-links">{countLabel(app.links.length, "link", "links")}</span>
        <span>{countLabel(app.sources.length, "model", "models")}</span>
        <span data-testid="status-zoom">{app.zoomPercent()}%</span>
        <span data-testid="status-run">{app.run.running ? "Running" : "Stopped"}</span>
        {app.run.error ? <span class="status-error" data-testid="status-run-error">{app.run.error}</span> : null}
        {app.io.error ? <span class="status-error" data-testid="status-io-error">{app.io.error}</span> : null}
        <span class="status-hint">
          {app.linkingFrom
            ? "Click an input handle to ground its type · Esc cancels"
            : "Click or drag output → input handles · scroll to zoom"}
        </span>
      </footer>
    );
  }
}

customElements.define("bld-status-bar", BldStatusBar);

declare global {
  interface HTMLElementTagNameMap {
    "bld-status-bar": BldStatusBar;
  }
}
