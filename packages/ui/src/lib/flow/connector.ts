import { LitElement, css, html } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  connectorWorldBounds,
  connectorWorldPolyline,
  cssPolygon,
  formatPolyline,
  strokePolygon,
  strokeRuns,
  translatePolyline,
  type Point,
  type RoutedLink,
} from "./geometry";
import { flowPeriodMs } from "@bld/xml";

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
    push: { type: Boolean, reflect: true, attribute: "data-push" },
    hz: { type: Number },
  };

  declare from: Point;
  declare to: Point;
  declare points: Point[];
  declare crossings: RoutedLink[];
    declare selected: boolean;
    declare preview: boolean;
    declare push: boolean;
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
      transform-origin: 0 50%;
      animation-name: bld-flow-dash;
    }
    :host([data-flow]) .seg {
      animation-timing-function: linear;
      animation-iteration-count: infinite;
      animation-duration: var(--flow-period, 0ms);
    }
    :host([data-push]) .seg {
      animation-direction: reverse;
    }
    :host(:not([data-flow])) .seg {
      animation-name: none;
    }
    @keyframes bld-flow-dash {
      to {
        background-position: 14px 0;
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
    this.push = false;
    this.hz = 0;
  }

  #polyline(): Point[] {
    return connectorWorldPolyline(this.from, this.to, this.points, this.crossings);
  }

  #box() {
    return connectorWorldBounds(this.from, this.to, this.points, this.crossings, PAD);
  }

  protected override willUpdate(): void {
    const world = this.#polyline();
    const box = this.#box();
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
    const box = this.#box();
    const local = translatePolyline(world, { x: box.left, y: box.top });
    const strokeW = this.selected ? SELECTED_WIDTH : STROKE_WIDTH;
    const period = !this.preview ? flowPeriodMs(this.hz) : null;
    const dashed = period !== null || this.preview;
    const segs = dashed ? strokeRuns(local) : [];
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
          const start = -(traveled % DASH_CYCLE);
          traveled += seg.length;
          return html`
            <div
              class="seg"
              style=${styleMap({
                left: `${seg.x}px`,
                top: `${seg.y - strokeW / 2}px`,
                width: `${seg.length}px`,
                height: `${strokeW}px`,
                transform: `rotate(${seg.angleDeg}deg)`,
                backgroundImage: `repeating-linear-gradient(90deg, var(--stroke) 0 ${DASH}px, transparent ${DASH}px ${DASH_CYCLE}px)`,
                backgroundPosition: `${start}px 0`,
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
