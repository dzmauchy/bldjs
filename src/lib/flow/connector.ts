import { LitElement, css, html } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  axisAlignedSegments,
  connectorWorldPolyline,
  cssPolygon,
  formatPolyline,
  polylineBounds,
  strokePolygon,
  translatePolyline,
  type Point,
} from "./geometry";
import { flowPeriodMs } from "$lib/runtime/flow";

const PAD = 16;
const HIT_WIDTH = 14;
const STROKE_WIDTH = 2.2;
const SELECTED_WIDTH = 3;
const DASH = 8;
const GAP = 6;
const DASH_CYCLE = DASH + GAP;

export class BldConnector extends LitElement {
  static override properties = {
    from: { attribute: false },
    to: { attribute: false },
    points: { attribute: false },
    crossings: { attribute: false },
    selected: { type: Boolean, reflect: true, attribute: "data-selected" },
    preview: { type: Boolean, reflect: true, attribute: "data-preview" },
    hz: { type: Number },
  };

  declare from: Point;
  declare to: Point;
  declare points: Point[];
  declare crossings: Point[][];
  declare selected: boolean;
  declare preview: boolean;
  declare hz: number;

  static override styles = css`
    :host {
      display: block;
      position: absolute;
      z-index: 0;
      pointer-events: none;
      overflow: visible;
      --stroke: color-mix(in srgb, var(--bs-primary, #0d6efd) 80%, white);
    }
    :host([data-preview]) {
      z-index: 3;
    }
    :host([data-selected]) {
      --stroke: var(--bs-info, #0dcaf0);
    }
    .path-hit,
    .path-stroke {
      position: absolute;
      inset: 0;
    }
    .path-hit {
      cursor: pointer;
      pointer-events: auto;
    }
    :host([data-preview]) .path-hit {
      pointer-events: none;
    }
    .path-stroke {
      pointer-events: none;
      background: var(--stroke);
    }
    .path-stroke.is-dashed {
      background: transparent;
    }
    .seg {
      position: absolute;
      pointer-events: none;
      background-repeat: repeat;
    }
    .seg.is-h {
      animation-name: bld-flow-dash-h;
    }
    .seg.is-v {
      animation-name: bld-flow-dash-v;
    }
    :host([data-flow]) .seg {
      animation-timing-function: linear;
      animation-iteration-count: infinite;
      animation-duration: var(--flow-period, 0ms);
    }
    :host(:not([data-flow])) .seg {
      animation-name: none;
    }
    @keyframes bld-flow-dash-h {
      to {
        background-position: 14px 0;
      }
    }
    @keyframes bld-flow-dash-v {
      to {
        background-position: 0 14px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .seg {
        animation: none !important;
      }
    }
  `;

  constructor() {
    super();
    this.from = { x: 0, y: 0 };
    this.to = { x: 0, y: 0 };
    this.points = [];
    this.crossings = [];
    this.selected = false;
    this.preview = false;
    this.hz = 0;
  }

  #polyline(): Point[] {
    return connectorWorldPolyline(this.from, this.to, this.points, this.crossings);
  }

  protected override willUpdate(): void {
    const world = this.#polyline();
    const box = polylineBounds(world, PAD);
    this.style.left = `${box.left}px`;
    this.style.top = `${box.top}px`;
    this.style.width = `${box.width}px`;
    this.style.height = `${box.height}px`;
    this.dataset.testid = this.preview ? "connector-preview" : "connector";
    this.dataset.points = formatPolyline(world);
    const period = !this.preview ? flowPeriodMs(this.hz) : null;
    if (period !== null) {
      this.style.setProperty("--flow-period", `${period}ms`);
      this.setAttribute("data-flow", "");
      this.dataset.hz = String(Math.round(this.hz));
    } else {
      this.style.removeProperty("--flow-period");
      this.removeAttribute("data-flow");
      delete this.dataset.hz;
    }
  }

  #onHitPointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("linkpointerdown", {
        bubbles: true,
        composed: true,
        detail: { clientX: event.clientX, clientY: event.clientY },
      }),
    );
  };

  protected override render() {
    const world = this.#polyline();
    const box = polylineBounds(world, PAD);
    const local = translatePolyline(world, { x: box.left, y: box.top });
    const strokeW = this.selected ? SELECTED_WIDTH : STROKE_WIDTH;
    const period = !this.preview ? flowPeriodMs(this.hz) : null;
    const dashed = period !== null || this.preview;
    const segs = dashed ? axisAlignedSegments(local) : [];
    let traveled = 0;
    return html`
      <div
        class="path-hit"
        style=${styleMap({ clipPath: cssPolygon(strokePolygon(local, HIT_WIDTH)) })}
        role="button"
        tabindex="-1"
        @pointerdown=${this.#onHitPointerDown}
      ></div>
      <div
        class=${classMap({ "path-stroke": true, "is-dashed": dashed })}
        style=${styleMap({ clipPath: cssPolygon(strokePolygon(local, strokeW)) })}
      >
        ${segs.map((seg) => {
          const length = seg.axis === "h" ? seg.x2 - seg.x1 : seg.y2 - seg.y1;
          const start = -(traveled % DASH_CYCLE);
          traveled += length;
          const horizontal = seg.axis === "h";
          const gradient = horizontal
            ? `repeating-linear-gradient(90deg, var(--stroke) 0 ${DASH}px, transparent ${DASH}px ${DASH_CYCLE}px)`
            : `repeating-linear-gradient(180deg, var(--stroke) 0 ${DASH}px, transparent ${DASH}px ${DASH_CYCLE}px)`;
          return html`
            <div
              class=${classMap({ seg: true, "is-h": horizontal, "is-v": !horizontal })}
              style=${styleMap({
                left: `${horizontal ? seg.x1 : seg.x1 - strokeW / 2}px`,
                top: `${horizontal ? seg.y1 - strokeW / 2 : seg.y1}px`,
                width: `${horizontal ? length : strokeW}px`,
                height: `${horizontal ? strokeW : length}px`,
                backgroundImage: gradient,
                backgroundPosition: horizontal ? `${start}px 0` : `0 ${start}px`,
              })}
            ></div>
          `;
        })}
      </div>
    `;
  }
}

customElements.define("bld-connector", BldConnector);

declare global {
  interface HTMLElementTagNameMap {
    "bld-connector": BldConnector;
  }
}
