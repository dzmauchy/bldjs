import { LitElement, css, html, nothing } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { AppController } from "$lib/context";
import { isNoneId } from "$lib/model";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";
import { ScopeCanvasPlot } from "./scope-chart";

export class BldScopeModal extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;
  #canvas = createRef<HTMLCanvasElement>();
  #plot: ScopeCanvasPlot | null = null;
  #tick: ReturnType<typeof setInterval> | null = null;
  #openId = -1;
  #seriesCount = 0;
  #painted = false;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: none;
      }
      :host([open]) {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 1055;
      }
      .modal-content {
        overflow: hidden;
      }
      .scope-chart {
        width: 100%;
        height: 280px;
        background: #14171a;
        position: relative;
      }
      .scope-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.4rem 0.75rem;
      }
      .scope-caption {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .scope-close {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.7rem;
        height: 1.7rem;
        padding: 0;
        border: 0;
        border-radius: 0.25rem;
        background: transparent;
        color: var(--bs-secondary-color, #adb5bd);
        font-size: 1.35rem;
        line-height: 1;
        cursor: pointer;
      }
      .scope-close:hover,
      .scope-close:focus-visible {
        color: var(--bs-body-color, #f8f9fa);
        background: var(--bs-tertiary-bg, rgba(255, 255, 255, 0.08));
      }
      canvas {
        display: block;
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
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

  disconnectedCallback(): void {
    this.#destroyPlot();
    super.disconnectedCallback();
  }

  protected override willUpdate(): void {
    this.#bindApp();
    this.toggleAttribute("open", !isNoneId(this.app?.scopeOpen ?? -1));
  }

  protected override updated(): void {
    const id = this.app?.scopeOpen ?? -1;
    const canvas = this.#canvas.value;
    if (!canvas || isNoneId(id)) {
      this.#destroyPlot();
      return;
    }
    if (this.#plot && this.#openId === id) {
      return;
    }
    this.#destroyPlot();
    this.#openId = id;
    this.#startPlot(canvas, id);
  }

  #bindApp(): void {
    if (!this.app || this.#ctrl?.app === this.app) {
      return;
    }
    this.#ctrl = new AppController(this, this.app);
  }

  #destroyPlot(): void {
    if (this.#tick !== null) {
      clearInterval(this.#tick);
      this.#tick = null;
    }
    this.#plot?.destroy();
    this.#plot = null;
    this.#openId = -1;
    this.#writeSeriesCount(0, false);
  }

  #writeSeriesCount(count: number, painted: boolean): void {
    this.#seriesCount = count;
    this.#painted = painted;
    const host = this.renderRoot.querySelector("[data-testid=scope-chart]");
    if (host instanceof HTMLElement) {
      host.dataset.seriesCount = String(count);
      host.dataset.painted = painted ? "true" : "false";
    }
  }

  #applySeries(plot: ScopeCanvasPlot, series: ReturnType<AppState["snapshotScope"]>): void {
    this.#writeSeriesCount(series.length, plot.setSeries(series));
  }

  #startPlot(canvas: HTMLCanvasElement, id: number): void {
    const plot = new ScopeCanvasPlot(canvas, (painted) => {
      if (this.#plot !== plot) {
        return;
      }
      this.#writeSeriesCount(plot.seriesCount, painted);
    });
    this.#plot = plot;
    this.#applySeries(plot, this.app.snapshotScope(id));
    plot.fit();
    const tick = (): void => {
      if (this.#openId !== id || this.#plot !== plot) {
        return;
      }
      this.#applySeries(plot, this.app.snapshotScope(id));
    };
    this.#tick = setInterval(tick, 50);
  }

  protected override render() {
    const app = this.app;
    if (!app || isNoneId(app.scopeOpen)) {
      return nothing;
    }
    return html`
      <div
        class="modal-backdrop fade show"
        role="button"
        tabindex="0"
        @click=${() => app.closeScope()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            app.closeScope();
          }
        }}
      ></div>
      <div class="modal fade show d-block" tabindex="-1" role="dialog" data-testid="scope-modal">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-body p-0">
              <div
                class="scope-chart"
                data-testid="scope-chart"
                data-series-count=${this.#seriesCount}
                data-painted=${this.#painted ? "true" : "false"}
              >
                <canvas ${ref(this.#canvas)}></canvas>
              </div>
              <div class="scope-footer">
                <div class="scope-caption small text-secondary" data-testid="scope-caption">
                  ${app.blockDisplayName(app.scopeOpen)}
                </div>
                <button
                  type="button"
                  class="scope-close"
                  title="Close"
                  aria-label="Close"
                  data-testid="scope-close"
                  @click=${() => app.closeScope()}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("bld-scope-modal", BldScopeModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-scope-modal": BldScopeModal;
  }
}
