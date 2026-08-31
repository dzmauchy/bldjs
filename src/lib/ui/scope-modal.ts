import { Chart } from "chart.js/auto";
import { LitElement, css, html, nothing } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { AppController } from "$lib/context";
import { isNoneId } from "$lib/model";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";
import { buildScopeChartConfig, longestIndexLabels, scopeChartDatasets, scopeChartScales } from "./scope-chart";

export class BldScopeModal extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;
  #canvas = createRef<HTMLCanvasElement>();
  #chart: Chart<"line"> | null = null;
  #tick: ReturnType<typeof setInterval> | null = null;
  #openId = -1;
  #seriesCount = 0;

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
    this.#destroyChart();
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
      this.#destroyChart();
      return;
    }
    if (this.#chart && this.#openId === id) {
      return;
    }
    this.#destroyChart();
    this.#openId = id;
    this.#startChart(canvas, id);
  }

  #bindApp(): void {
    if (!this.app || this.#ctrl?.app === this.app) {
      return;
    }
    this.#ctrl = new AppController(this, this.app);
  }

  #destroyChart(): void {
    if (this.#tick !== null) {
      clearInterval(this.#tick);
      this.#tick = null;
    }
    this.#chart?.destroy();
    this.#chart = null;
    this.#openId = -1;
    this.#writeSeriesCount(0);
  }

  #writeSeriesCount(count: number): void {
    this.#seriesCount = count;
    const host = this.renderRoot.querySelector("[data-testid=scope-chart]");
    if (host instanceof HTMLElement) {
      host.dataset.seriesCount = String(count);
    }
  }

  #applySeries(chart: Chart<"line">, series: ReturnType<AppState["snapshotScope"]>): void {
    if (this.#seriesCount !== series.length) {
      chart.data.datasets = scopeChartDatasets(series);
      chart.options.scales = scopeChartScales(Math.max(series.length, 1));
      if (chart.options.plugins?.legend) {
        chart.options.plugins.legend.display = series.length > 1;
      }
    } else {
      series.forEach((channel, index) => {
        const dataset = chart.data.datasets[index];
        if (dataset) {
          dataset.data = channel.samples;
          dataset.label = channel.label;
        }
      });
    }
    chart.data.labels = longestIndexLabels(series);
    chart.update("none");
    this.#writeSeriesCount(series.length);
  }

  #fitChart(chart: Chart<"line">): void {
    const fit = (): void => {
      if (this.#chart !== chart) {
        return;
      }
      chart.resize();
    };
    fit();
    requestAnimationFrame(() => {
      fit();
      requestAnimationFrame(fit);
    });
  }

  #startChart(canvas: HTMLCanvasElement, id: number): void {
    const series = this.app.snapshotScope(id);
    const chart = new Chart(canvas, buildScopeChartConfig(series));
    this.#chart = chart;
    this.#writeSeriesCount(series.length);
    this.#fitChart(chart);
    const tick = (): void => {
      if (this.#openId !== id || !this.#chart) {
        return;
      }
      this.#applySeries(chart, this.app.snapshotScope(id));
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
