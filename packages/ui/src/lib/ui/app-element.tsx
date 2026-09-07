import { createEffect, Show, type JSX } from "solid-js";
import { createReactiveApp } from "$lib/context";
import { COMPACT_UI_QUERY, compactUiMatches, isNoneId } from "$lib/model";
import { AppState } from "$lib/state";
import { SolidElement } from "./app-host";
import "./about-modal";
import "./diagram-io-modal";
import "./toolbar";
import "./scope-modal";
import "./inputs-modal";
import "./palette";
import "./status-bar";
import "./workspace";

export class BldApp extends SolidElement {
  readonly app = new AppState();
  #compact?: MediaQueryList;

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.#onKey);
    window.addEventListener("orientationchange", this.#syncCompact);
    window.addEventListener("resize", this.#syncCompact);
    if (typeof window.matchMedia === "function") {
      this.#compact = window.matchMedia(COMPACT_UI_QUERY);
      this.#compact.addEventListener("change", this.#syncCompact);
    }
    this.#syncCompact();
  }

  override disconnectedCallback(): void {
    this.app.run.stop();
    window.removeEventListener("keydown", this.#onKey);
    window.removeEventListener("orientationchange", this.#syncCompact);
    window.removeEventListener("resize", this.#syncCompact);
    this.#compact?.removeEventListener("change", this.#syncCompact);
    document.documentElement.classList.remove("compact-ui");
    super.disconnectedCallback();
  }

  #syncCompact = (): void => {
    this.app.compactUi = compactUiMatches();
  };

  #onKey = (event: KeyboardEvent): void => {
    const app = this.app;
    const meta = event.ctrlKey || event.metaKey;
    if (meta) {
      if (event.key === "0") { event.preventDefault(); app.resetView(); }
      else if (event.key === "=" || event.key === "+") { event.preventDefault(); app.zoomIn(); }
      else if (event.key === "-") { event.preventDefault(); app.zoomOut(); }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (app.aboutOpen || app.io.mode !== "closed" || !isNoneId(app.inputsOpen)) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      app.deleteSelected();
    } else if (event.key === "Escape") {
      if (app.io.mode !== "closed") { app.io.close(); return; }
      app.clearSelection();
      app.aboutOpen = false;
      app.draggingDefId = null;
      app.linkingFrom = null;
      app.closePalette();
      app.closeScope();
      app.closeInputs();
    }
  };

  override render(): JSX.Element {
    const app = createReactiveApp(this.app);

    createEffect(() => {
      const isCompact = app.compactUi;
      this.toggleAttribute("data-compact", isCompact);
      document.documentElement.classList.toggle("compact-ui", isCompact);
    });

    return (
      <>
        <div class={`app-shell${app.isDragging() ? " is-dragging" : ""}`}>
          <bld-toolbar prop:app={app}></bld-toolbar>
          <div class="app-body">
            <Show when={app.compactUi && app.paletteOpen}>
              <div
                class="palette-backdrop"
                data-testid="palette-backdrop"
                onPointerDown={(e: PointerEvent) => e.stopPropagation()}
                onClick={() => app.closePalette()}
              />
            </Show>
            <bld-palette prop:app={app}></bld-palette>
            <bld-workspace prop:app={app}></bld-workspace>
          </div>
          <bld-status-bar prop:app={app}></bld-status-bar>
        </div>
        <bld-about-modal prop:app={app}></bld-about-modal>
        <bld-diagram-io-modal prop:app={app}></bld-diagram-io-modal>
        <bld-scope-modal prop:app={app}></bld-scope-modal>
        <bld-inputs-modal prop:app={app}></bld-inputs-modal>
      </>
    );
  }
}

customElements.define("bld-app", BldApp);

declare global {
  interface HTMLElementTagNameMap {
    "bld-app": BldApp;
  }
}
