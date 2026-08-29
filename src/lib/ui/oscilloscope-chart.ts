import { Chart, type ChartConfiguration } from "chart.js/auto";
import { LitElement, css, html, nothing } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { AppController } from "$lib/context";
import { isNoneId } from "$lib/model";
import type { AppState } from "$lib/state";
import { bootstrapStyles } from "./bootstrap";

export class BldOscilloscopeChart extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;

  #ctrl?: AppController;
  #canvas = createRef<HTMLCanvasElement>();
  #chart: Chart<"line"> | null = null;
  #tick: ReturnType<typeof setInterval> | null = null;
  #openId = -1;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: contents;
      }
      .scope-chart {
        width: 100%;
        height: 280px;
        background: #14171a;
        border-radius: 0.35rem;
        position: relative;
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
  }

  #startChart(canvas: HTMLCanvasElement, id: number): void {
    const darkGrid = "rgba(255, 255, 255, 0.08)";
    const darkTick = "#adb5bd";
    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "samples",
            data: [],
            borderColor: "#0dcaf0",
            backgroundColor: "rgba(13, 202, 240, 0.16)",
            fill: true,
            pointRadius: 0,
            borderWidth: 1.8,
            tension: 0.25,
            spanGaps: true,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        color: darkTick,
        font: { family: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "#1c2125",
            titleColor: "#f8f9fa",
            bodyColor: "#0dcaf0",
            borderColor: "rgba(255,255,255,0.12)",
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            display: false,
            grid: { color: darkGrid },
          },
          y: {
            grid: { color: darkGrid },
            border: { color: darkGrid },
            ticks: { color: darkTick, maxTicksLimit: 6 },
          },
        },
      },
    };
    const chart = new Chart(canvas, config);
    const tick = (): void => {
      void this.app.snapshotScope(id).then((samples) => {
        if (this.#openId !== id || !this.#chart) {
          return;
        }
        chart.data.labels = samples.map((_, index) => index);
        chart.data.datasets[0].data = samples;
        chart.update("none");
      });
    };
    tick();
    this.#chart = chart;
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
        @click=${() => app.closeOscilloscope()}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            app.closeOscilloscope();
          }
        }}
      ></div>
      <div class="modal fade show d-block" tabindex="-1" role="dialog" data-testid="oscilloscope-modal">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Oscilloscope #${app.scopeOpen}</h5>
              <button
                type="button"
                class="btn-close"
                aria-label="Close"
                @click=${() => app.closeOscilloscope()}
              ></button>
            </div>
            <div class="modal-body p-3">
              <div class="scope-chart">
                <canvas ${ref(this.#canvas)}></canvas>
              </div>
              <div class="small text-secondary mt-2">oscilloscope(sin(quantizer(timer()))) · shared buffer</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("bld-oscilloscope-chart", BldOscilloscopeChart);

declare global {
  interface HTMLElementTagNameMap {
    "bld-oscilloscope-chart": BldOscilloscopeChart;
  }
}
