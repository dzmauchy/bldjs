import { LitElement, css, html } from "lit";
import { jumpoverLinkBounds, translateJumpover, type Point, type RoutedLink } from "./geometry";
import { flowPeriodMs } from "$lib/runtime/flow";

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
  declare crossings: RoutedLink[];
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
    }
    :host([data-preview]) {
      z-index: 3;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .path-hit {
      fill: none;
      stroke: transparent;
      stroke-width: 14;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: stroke;
      cursor: pointer;
    }
    .path-stroke {
      fill: none;
      stroke: color-mix(in srgb, var(--bs-primary, #0d6efd) 80%, white);
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }
    :host([data-selected]) .path-stroke {
      stroke: var(--bs-info, #0dcaf0);
      stroke-width: 3;
    }
    :host([data-preview]) .path-stroke {
      stroke-dasharray: 6 4;
    }
    :host([data-preview]) .path-hit {
      pointer-events: none;
    }
    :host([data-flow]) .path-stroke {
      stroke-dasharray: 8 6;
      animation: bld-flow-dash var(--flow-period, 400ms) linear infinite;
    }
    @keyframes bld-flow-dash {
      to {
        stroke-dashoffset: -14;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host([data-flow]) .path-stroke {
        animation: none;
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

  protected override willUpdate(): void {
    const box = this.#box();
    this.style.left = `${box.left}px`;
    this.style.top = `${box.top}px`;
    this.style.width = `${box.width}px`;
    this.style.height = `${box.height}px`;
    this.dataset.testid = this.preview ? "connector-preview" : "connector";
    const flowing = !this.preview && this.hz > 0;
    if (flowing) {
      this.setAttribute("data-flow", "");
      this.dataset.hz = String(Math.round(this.hz));
      this.style.setProperty("--flow-period", `${flowPeriodMs(this.hz)}ms`);
    } else {
      this.removeAttribute("data-flow");
      delete this.dataset.hz;
      this.style.removeProperty("--flow-period");
    }
  }

  #vertices(): Point[] {
    return this.points;
  }

  #box() {
    return jumpoverLinkBounds(this.from, this.to, this.#vertices(), this.crossings);
  }

  #d(): string {
    const vertices = this.#vertices();
    const box = jumpoverLinkBounds(this.from, this.to, vertices, this.crossings);
    return translateJumpover(this.from, this.to, vertices, { x: box.left, y: box.top }, this.crossings);
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
    const box = this.#box();
    const d = this.#d();
    return html`
      <svg width=${box.width} height=${box.height} viewBox=${`0 0 ${box.width} ${box.height}`}>
        <path class="path-hit" d=${d} role="button" tabindex="-1" @pointerdown=${this.#onHitPointerDown}></path>
        <path class="path-stroke" d=${d}></path>
      </svg>
    `;
  }
}

customElements.define("bld-connector", BldConnector);

declare global {
  interface HTMLElementTagNameMap {
    "bld-connector": BldConnector;
  }
}
