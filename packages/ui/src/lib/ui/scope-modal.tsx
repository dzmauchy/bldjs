import { createEffect, createSignal, type JSX } from "solid-js";
import { isNoneId } from "$lib/model";
import { capturePointer, releasePointer } from "$lib/flow/pointer";
import type { ScopeSeries } from "@bld/xml/blocks/cs/types";
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
  #canvas: HTMLCanvasElement | null = null;
  #panel: HTMLDivElement | null = null;
  #plot: ScopeCanvasPlot | null = null;
  #tick: ReturnType<typeof setInterval> | null = null;
  #openId = -1;
  #laidOut = false;
  readonly #seriesCount = createSignal(0);
  readonly #sampleCount = createSignal(0);
  readonly #painted = createSignal(false);
  readonly #left = createSignal<number | null>(null);
  readonly #top = createSignal<number | null>(null);
  readonly #dragging = createSignal(false);
  #drag: ScopeDrag | null = null;
  #listening = false;

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
    this.#seriesCount[1](0);
    this.#sampleCount[1](0);
    this.#painted[1](false);
  }

  #applySeries(plot: ScopeCanvasPlot, series: ScopeSeries[]): void {
    const sampleCount = series.reduce((max, channel) => Math.max(max, channel.samples.length), 0);
    this.#seriesCount[1](series.length);
    this.#sampleCount[1](sampleCount);
    this.#painted[1](plot.setSeries(series));
  }

  #startTicks(id: number): void {
    this.#stopTicks();
    const plot = this.#plot;
    if (!plot) return;
    this.#tick = setInterval(() => {
      if (this.#openId !== id || this.#plot !== plot) return;
      this.#applySeries(plot, this.app.run.snapshotScope(id));
    }, 50);
  }

  #startPlot(canvas: HTMLCanvasElement): void {
    const plot = new ScopeCanvasPlot(canvas, (painted) => {
      if (this.#plot !== plot) return;
      this.#seriesCount[1](plot.seriesCount);
      this.#painted[1](painted);
    });
    this.#plot = plot;
    void canvas.parentElement?.offsetWidth;
    plot.setSeries([]);
    plot.fit();
  }

  #panelSize(): { width: number; height: number } {
    const p = this.#panel;
    if (p) {
      const w = p.offsetWidth || p.getBoundingClientRect().width;
      const h = p.offsetHeight || p.getBoundingClientRect().height;
      if (w >= 2 && h >= 2) return { width: w, height: h };
    }
    return { width: SCOPE_CHART_MAX_WIDTH, height: SCOPE_CHART_HEIGHT + 40 };
  }

  #moveTo(left: number, top: number): void {
    const { width, height } = this.#panelSize();
    const next = clampScopePanelPosition(left, top, width, height, window.innerWidth, window.innerHeight);
    this.#left[1](next.left);
    this.#top[1](next.top);
  }

  #onResize = (): void => {
    const l = this.#left[0]();
    const t = this.#top[0]();
    if (l !== null && t !== null) this.#moveTo(l, t);
  };

  #stopDrag(target: EventTarget | null = null): void {
    const drag = this.#drag;
    this.#drag = null;
    this.#dragging[1](false);
    if (drag) releasePointer(target ?? drag.handle, drag.pointerId);
    if (!this.#listening) return;
    this.#listening = false;
    window.removeEventListener("pointermove", this.#onWindowPointerMove);
    window.removeEventListener("pointerup", this.#onWindowPointerUp);
    window.removeEventListener("pointercancel", this.#onWindowPointerUp);
  }

  #onFooterPointerDown = (event: PointerEvent): void => {
    if (event.isPrimary === false || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("[data-testid=scope-close]")) return;
    const panel = this.#panel;
    if (!(panel instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    this.#drag = {
      pointerId: event.pointerId,
      handle: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    this.#moveTo(rect.left, rect.top);
    this.#dragging[1](true);
    capturePointer(event.currentTarget, event.pointerId);
    if (!this.#listening) {
      this.#listening = true;
      window.addEventListener("pointermove", this.#onWindowPointerMove);
      window.addEventListener("pointerup", this.#onWindowPointerUp);
      window.addEventListener("pointercancel", this.#onWindowPointerUp);
    }
  };

  #onWindowPointerMove = (e: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    this.#moveTo(drag.origLeft + e.clientX - drag.startX, drag.origTop + e.clientY - drag.startY);
  };

  #onWindowPointerUp = (e: PointerEvent): void => {
    if (this.#drag && e.pointerId === this.#drag.pointerId) this.#stopDrag(e.target);
  };

  override render(): JSX.Element {
    const app = this.reactiveApp;
    if (!app) return null;

    createEffect(() => {
      const id = app.scopeOpen ?? -1;
      const isOpen = !isNoneId(id);
      this.toggleAttribute("open", isOpen);

      const canvas = this.#canvas;
      if (!canvas) return;
      if (!this.#laidOut) {
        void canvas.parentElement?.offsetWidth;
        this.#laidOut = true;
      }
      if (!this.#plot) this.#startPlot(canvas);
      const plot = this.#plot;
      if (!plot) return;
      if (!isOpen) {
        this.#stopTicks();
        this.#openId = -1;
        return;
      }
      if (this.#openId === id) return;
      this.#openId = id;
      plot.resetScales();
      this.#applySeries(plot, app.run.snapshotScope(id));
      plot.fit();
      this.#startTicks(id);
    });

    const open = () => !isNoneId(app.scopeOpen);
    const left = () => this.#left[0]();
    const top = () => this.#top[0]();
    const placed = () => left() !== null && top() !== null;

    return (
      <div
        ref={(el) => (this.#panel = el)}
        class={`scope-panel${!open() ? " is-closed" : ""}${placed() ? " is-placed" : ""}`}
        style={placed() ? { left: `${left()}px`, top: `${top()}px` } : undefined}
        tabindex="-1"
        role="region"
        aria-label="Scope"
        data-testid="scope-modal"
        inert={!open() || undefined}
        aria-hidden={open() ? "false" : "true"}
      >
        <div
          class="scope-chart"
          data-testid="scope-chart"
          data-series-count={this.#seriesCount[0]()}
          data-sample-count={this.#sampleCount[0]()}
          data-painted={this.#painted[0]() ? "true" : "false"}
        >
          <canvas ref={(el) => (this.#canvas = el)}></canvas>
        </div>
        <div
          class={`scope-footer${this.#dragging[0]() ? " is-dragging" : ""}`}
          data-testid="scope-footer"
          onPointerDown={this.#onFooterPointerDown}
        >
          <div class="scope-caption" data-testid="scope-caption">
            {open() ? app.blockDisplayName(app.scopeOpen) : ""}
          </div>
          <button
            type="button"
            class="scope-close"
            title="Close"
            aria-label="Close"
            data-testid="scope-close"
            onPointerDown={(e: PointerEvent) => e.stopPropagation()}
            onClick={() => app.closeScope()}
          >
            ×
          </button>
        </div>
      </div>
    );
  }
}

customElements.define("bld-scope-modal", BldScopeModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-scope-modal": BldScopeModal;
  }
}
