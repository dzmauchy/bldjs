import { LitElement, css, html } from "lit";
import { cubicLink, cubicLinkBounds, translatePath, type Point } from "./geometry";

export class BldConnector extends LitElement {
  static override properties = {
    from: { attribute: false },
    to: { attribute: false },
    selected: { type: Boolean, reflect: true, attribute: "data-selected" },
    preview: { type: Boolean, reflect: true, attribute: "data-preview" },
  };

  declare from: Point;
  declare to: Point;
  declare selected: boolean;
  declare preview: boolean;

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
      pointer-events: stroke;
      cursor: pointer;
    }
    .path-stroke {
      fill: none;
      stroke: color-mix(in srgb, var(--bs-primary, #0d6efd) 80%, white);
      stroke-width: 2.2;
      stroke-linecap: round;
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
  `;

  constructor() {
    super();
    this.from = { x: 0, y: 0 };
    this.to = { x: 0, y: 0 };
    this.selected = false;
    this.preview = false;
  }

  protected override willUpdate(): void {
    const box = this.#box();
    this.style.left = `${box.left}px`;
    this.style.top = `${box.top}px`;
    this.style.width = `${box.width}px`;
    this.style.height = `${box.height}px`;
    this.dataset.testid = this.preview ? "connector-preview" : "connector";
  }

  #link() {
    return cubicLink(this.from, this.to);
  }

  #box() {
    return cubicLinkBounds(this.#link());
  }

  #d(): string {
    const link = this.#link();
    const box = cubicLinkBounds(link);
    return translatePath(link, { x: box.left, y: box.top });
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
