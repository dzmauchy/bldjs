import { LitElement, css, html, nothing } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { AppController } from "$lib/context";
import { isNoneId } from "$lib/model";
import type { AppState } from "$lib/state";
import type { ScopeSeries } from "@bld/xml/blocks/cs/types";
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
  #sampleCount = 0;
  #painted = false;
  #laidOut = false;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: contents;
      }
      .modal,
      .modal-dialog,
      .modal-backdrop {
        transition: none;
        transform: none;
      }
      /* Keep the overlay in the box tree while closed so the canvas is
         already sized before the first open. Do not use display: none. */
      :host(:not([open])) .modal,
      :host(:not([open])) .modal-backdrop {
        visibility: hidden;
        pointer-events: none;
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
    if (!canvas) {
      return;
    }
    if (!this.#laidOut) {
      void canvas.parentElement?.offsetWidth;
      this.#laidOut = true;
    }
    if (isNoneId(id)) {
      this.#stopTicks();
      this.#openId = -1;
      return;
    }
    if (!this.#plot) {
      this.#startPlot(canvas, id);
      return;
    }
    if (this.#openId === id) {
      return;
    }
    this.#openId = id;
    this.#applySeries(this.#plot, this.app.run.snapshotScope(id));
    this.#plot.fit();
    this.#startTicks(id);
  }

  #bindApp(): void {
    if (!this.app || this.#ctrl?.app === this.app) {
      return;
    }
    this.#ctrl = new AppController(this, this.app);
  }

  #stopTicks(): void {
    if (this.#tick !== null) {
      clearInterval(this.#tick);
      this.#tick = null;
    }
  }

  #destroyPlot(): void {
    this.#stopTicks();
    this.#plot?.destroy();
    this.#plot = null;
    this.#openId = -1;
    this.#laidOut = false;
    this.#writeSeriesCount(0, 0, false);
  }

  #writeSeriesCount(count: number, sampleCount: number, painted: boolean): void {
    this.#seriesCount = count;
    this.#sampleCount = sampleCount;
    this.#painted = painted;
    const host = this.renderRoot.querySelector("[data-testid=scope-chart]");
    if (host instanceof HTMLElement) {
      host.dataset.seriesCount = String(count);
      host.dataset.sampleCount = String(sampleCount);
      host.dataset.painted = painted ? "true" : "false";
    }
  }

  #applySeries(plot: ScopeCanvasPlot, series: ScopeSeries[]): void {
    const sampleCount = series.reduce((max, channel) => Math.max(max, channel.samples.length), 0);
    this.#writeSeriesCount(series.length, sampleCount, plot.setSeries(series));
  }

  #startTicks(id: number): void {
    this.#stopTicks();
    const plot = this.#plot;
    if (!plot) {
      return;
    }
    this.#tick = setInterval(() => {
      if (this.#openId !== id || this.#plot !== plot) {
        return;
      }
      this.#applySeries(plot, this.app.run.snapshotScope(id));
    }, 50);
  }

  #startPlot(canvas: HTMLCanvasElement, id: number): void {
    const plot = new ScopeCanvasPlot(canvas, (painted) => {
      if (this.#plot !== plot) {
        return;
      }
      this.#writeSeriesCount(plot.seriesCount, this.#sampleCount, painted);
    });
    this.#plot = plot;
    this.#openId = id;
    void canvas.parentElement?.offsetWidth;
    this.#applySeries(plot, this.app.run.snapshotScope(id));
    plot.fit();
    this.#startTicks(id);
  }

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    const open = !isNoneId(app.scopeOpen);
    return html`
      <div
        class="modal-backdrop show"
        role="button"
        tabindex="0"
        ?inert=${!open}
        aria-hidden=${open ? "false" : "true"}
        @click=${() => app.closeScope()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            app.closeScope();
          }
        }}
      ></div>
      <div
        class="modal show d-block"
        tabindex="-1"
        role="dialog"
        data-testid="scope-modal"
        ?inert=${!open}
        aria-hidden=${open ? "false" : "true"}
      >
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-body p-0">
              <div
                class="scope-chart"
                data-testid="scope-chart"
                data-series-count=${this.#seriesCount}
                data-sample-count=${this.#sampleCount}
                data-painted=${this.#painted ? "true" : "false"}
              >
                <canvas ${ref(this.#canvas)}></canvas>
              </div>
              <div class="scope-footer">
                <div class="scope-caption small text-secondary" data-testid="scope-caption">
                  ${open ? app.blockDisplayName(app.scopeOpen) : ""}
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
