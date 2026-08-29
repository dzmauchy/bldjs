import { LitElement, css, html } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { AppController } from "$lib/context";
import { isNoneId } from "$lib/model";
import { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";
import "./about-modal";
import "./menu-bar";
import "./oscilloscope-chart";
import "./palette";
import "./status-bar";
import "./workspace";

export class BldApp extends LitElement {
  readonly app = new AppState();
  #ctrl = new AppController(this, this.app);

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        background: var(--bs-body-bg);
        color: var(--bs-body-color);
      }
      .app-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bs-body-bg);
        color: var(--bs-body-color);
      }
      .app-body {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        background: #121416;
      }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    this.app.reconcileTimers();
    this.#unsubTopology = this.app.subscribe(() => this.app.reconcileTimers());
    window.addEventListener("keydown", this.#onKey);
  }

  disconnectedCallback(): void {
    this.#unsubTopology?.();
    window.removeEventListener("keydown", this.#onKey);
    super.disconnectedCallback();
  }

  #unsubTopology?: () => void;

  #onKey = (event: KeyboardEvent): void => {
    const app = this.app;
    const meta = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "Delete":
      case "Backspace":
        if (app.aboutOpen || !isNoneId(app.scopeOpen)) {
          break;
        }
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
          break;
        }
        event.preventDefault();
        app.deleteSelected();
        break;
      case "Escape":
        app.clearSelection();
        app.aboutOpen = false;
        app.draggingDefId = null;
        app.linkingFrom = null;
        app.closeOscilloscope();
        break;
      case "0":
        if (meta) {
          event.preventDefault();
          app.resetView();
        }
        break;
      case "=":
      case "+":
        if (meta) {
          event.preventDefault();
          app.zoomIn();
        }
        break;
      case "-":
        if (meta) {
          event.preventDefault();
          app.zoomOut();
        }
        break;
      default:
        break;
    }
  };

  protected override render() {
    const app = this.app;
    return html`
      <div class=${classMap({ "app-shell": true, "is-dragging": app.isDragging() })}>
        <bld-menu-bar .app=${app}></bld-menu-bar>
        <div class="app-body">
          <bld-palette .app=${app}></bld-palette>
          <bld-workspace .app=${app}></bld-workspace>
        </div>
        <bld-status-bar .app=${app}></bld-status-bar>
      </div>
      <bld-about-modal .app=${app}></bld-about-modal>
      <bld-oscilloscope-chart .app=${app}></bld-oscilloscope-chart>
    `;
  }
}

customElements.define("bld-app", BldApp);

declare global {
  interface HTMLElementTagNameMap {
    "bld-app": BldApp;
  }
}
