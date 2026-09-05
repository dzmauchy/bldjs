import { css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { createRef, ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { isNoneId } from "$lib/model";
import { capturePointer, releasePointer } from "$lib/flow/pointer";
import type { ScopeSeries } from "@bld/xml/blocks/cs/types";
import { bootstrapStyles } from "./bootstrap";
import { AppHost } from "./app-host";
import { SCOPE_CHART_HEIGHT, SCOPE_CHART_MAX_WIDTH, ScopeCanvasPlot } from "./scope-chart";

type ScopeDrag = {
  pointerId: number;
  handle: EventTarget | null;
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
};

export function clampScopePanelPosition(
  left: number,
  top: number,
  width: number,
  height: number,
  viewW: number,
  viewH: number,
): { left: number; top: number } {
  const maxLeft = Math.max(0, viewW - width);
  const maxTop = Math.max(0, viewH - height);
  return {
    left: Math.min(maxLeft, Math.max(0, left)),
    top: Math.min(maxTop, Math.max(0, top)),
  };
}

export class BldScopeModal extends AppHost {
  #canvas = createRef<HTMLCanvasElement>();
  #panel = createRef<HTMLDivElement>();
  #plot: ScopeCanvasPlot | null = null;
  #tick: ReturnType<typeof setInterval> | null = null;
  #openId = -1;
  #seriesCount = 0;
  #sampleCount = 0;
  #painted = false;
  #laidOut = false;
  #left: number | null = null;
  #top: number | null = null;
  #drag: ScopeDrag | null = null;
  #listening = false;

  static override styles = [
    bootstrapStyles,
    css`
      :host {
        display: contents;
      }
      .scope-panel {
        position: fixed;
        z-index: 1040;
        width: min(${SCOPE_CHART_MAX_WIDTH}px, calc(100vw - 2rem));
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        overflow: hidden;
        background: var(--bs-modal-bg, var(--bs-body-bg, #212529));
        color: var(--bs-body-color, #dee2e6);
        transition: none;
      }
      .scope-panel.is-placed {
        transform: none;
      }
      /* Keep the overlay in the box tree while closed so the canvas is
         already sized and the 2d context is warm before the first open.
         Do not use display: none. */
      :host(:not([open])) .scope-panel,
      .scope-panel.is-closed {
        visibility: hidden;
        pointer-events: none;
        opacity: 0;
      }
      .scope-chart {
        width: 100%;
        height: ${SCOPE_CHART_HEIGHT}px;
        background: #14171a;
        position: relative;
        content-visibility: visible;
      }
      .scope-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.4rem 0.75rem;
        background: #1b1f22;
        border-top: 1px solid #2b3035;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }
      .scope-footer.is-dragging {
        cursor: grabbing;
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

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("resize", this.#onResize);
  }

  override disconnectedCallback(): void {
    this.#stopDrag();
    window.removeEventListener("resize", this.#onResize);
    this.#destroyPlot();
    super.disconnectedCallback();
  }

  protected override willUpdate(): void {
    super.willUpdate();
    this.toggleAttribute("open", !isNoneId(this.app?.scopeOpen ?? -1));
  }

  protected override updated(): void {
    super.updated();
    const id = this.app?.scopeOpen ?? -1;
    const canvas = this.#canvas.value;
    if (!canvas) {
      return;
    }
    if (!this.#laidOut) {
      void canvas.parentElement?.offsetWidth;
      this.#laidOut = true;
    }
    if (!this.#plot) {
      this.#startPlot(canvas);
    }
    const plot = this.#plot;
    if (!plot) {
      return;
    }
    if (isNoneId(id)) {
      this.#stopTicks();
      this.#openId = -1;
      return;
    }
    if (this.#openId === id) {
      return;
    }
    this.#openId = id;
    this.#applySeries(plot, this.app.run.snapshotScope(id));
    plot.fit();
    this.#startTicks(id);
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

  #startPlot(canvas: HTMLCanvasElement): void {
    const plot = new ScopeCanvasPlot(canvas, (painted) => {
      if (this.#plot !== plot) {
        return;
      }
      this.#writeSeriesCount(plot.seriesCount, this.#sampleCount, painted);
    });
    this.#plot = plot;
    void canvas.parentElement?.offsetWidth;
    plot.setSeries([]);
    plot.fit();
  }

  #panelSize(): { width: number; height: number } {
    const panel = this.#panel.value;
    if (panel) {
      const width = panel.offsetWidth || panel.getBoundingClientRect().width;
      const height = panel.offsetHeight || panel.getBoundingClientRect().height;
      if (width >= 2 && height >= 2) {
        return { width, height };
      }
    }
    return { width: SCOPE_CHART_MAX_WIDTH, height: SCOPE_CHART_HEIGHT + 40 };
  }

  #moveTo(left: number, top: number): void {
    const { width, height } = this.#panelSize();
    const next = clampScopePanelPosition(left, top, width, height, window.innerWidth, window.innerHeight);
    this.#left = next.left;
    this.#top = next.top;
    const panel = this.#panel.value;
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
    panel.classList.add("is-placed");
  }

  #onResize = (): void => {
    if (this.#left === null || this.#top === null) {
      return;
    }
    this.#moveTo(this.#left, this.#top);
  };

  #listenWindow(): void {
    if (this.#listening) {
      return;
    }
    this.#listening = true;
    window.addEventListener("pointermove", this.#onWindowPointerMove);
    window.addEventListener("pointerup", this.#onWindowPointerUp);
    window.addEventListener("pointercancel", this.#onWindowPointerUp);
  }

  #stopDrag(target: EventTarget | null = null): void {
    const drag = this.#drag;
    this.#drag = null;
    this.#panel.value?.querySelector(".scope-footer")?.classList.remove("is-dragging");
    if (drag) {
      releasePointer(target ?? drag.handle, drag.pointerId);
    }
    if (!this.#listening) {
      return;
    }
    this.#listening = false;
    window.removeEventListener("pointermove", this.#onWindowPointerMove);
    window.removeEventListener("pointerup", this.#onWindowPointerUp);
    window.removeEventListener("pointercancel", this.#onWindowPointerUp);
  }

  #onFooterPointerDown = (event: PointerEvent): void => {
    if (event.isPrimary === false || event.button !== 0) {
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-testid=scope-close]")) {
      return;
    }
    const panel = this.#panel.value;
    const footer = event.currentTarget;
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    this.#drag = {
      pointerId: event.pointerId,
      handle: footer,
      startX: event.clientX,
      startY: event.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    this.#moveTo(rect.left, rect.top);
    if (footer instanceof HTMLElement) {
      footer.classList.add("is-dragging");
    }
    capturePointer(footer, event.pointerId);
    this.#listenWindow();
  };

  #onWindowPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    event.preventDefault();
    this.#moveTo(drag.origLeft + event.clientX - drag.startX, drag.origTop + event.clientY - drag.startY);
  };

  #onWindowPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    this.#stopDrag(event.target);
  };

  protected override render() {
    const app = this.app;
    if (!app) {
      return nothing;
    }
    const open = !isNoneId(app.scopeOpen);
    const placed = this.#left !== null && this.#top !== null;
    return html`
      <div
        ${ref(this.#panel)}
        class=${classMap({
          "scope-panel": true,
          border: true,
          rounded: true,
          shadow: true,
          "is-closed": !open,
          "is-placed": placed,
        })}
        style=${styleMap(placed ? { left: `${this.#left}px`, top: `${this.#top}px` } : {})}
        tabindex="-1"
        role="region"
        aria-label="Scope"
        data-testid="scope-modal"
        ?inert=${!open}
        aria-hidden=${open ? "false" : "true"}
      >
        <div
          class="scope-chart"
          data-testid="scope-chart"
          data-series-count=${this.#seriesCount}
          data-sample-count=${this.#sampleCount}
          data-painted=${this.#painted ? "true" : "false"}
        >
          <canvas ${ref(this.#canvas)}></canvas>
        </div>
        <div class="scope-footer" data-testid="scope-footer" @pointerdown=${this.#onFooterPointerDown}>
          <div class="scope-caption small text-secondary" data-testid="scope-caption">
            ${open ? app.blockDisplayName(app.scopeOpen) : ""}
          </div>
          <button
            type="button"
            class="scope-close"
            title="Close"
            aria-label="Close"
            data-testid="scope-close"
            @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
            @click=${() => app.closeScope()}
          >
            ×
          </button>
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
