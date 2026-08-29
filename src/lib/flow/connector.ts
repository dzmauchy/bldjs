import { cubicLink, cubicLinkBounds, translatePath, type Point } from "./geometry";
import { attachShadowStyles } from "./styles";

export interface ConnectorEndpoints {
  from: Point;
  to: Point;
}

const CONNECTOR_CSS = `
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
  pointer-events: none;
}
:host([data-preview]) .path-hit {
  pointer-events: none;
}
`;

export class BldConnector extends HTMLElement {
  static readonly tagName = "bld-connector";

  readonly #shadow: ShadowRoot;
  readonly #svg: SVGSVGElement;
  readonly #hit: SVGPathElement;
  readonly #stroke: SVGPathElement;
  #from: Point = { x: 0, y: 0 };
  #to: Point = { x: 0, y: 0 };

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open" });
    attachShadowStyles(this.#shadow, CONNECTOR_CSS);

    this.#svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.#hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.#hit.setAttribute("class", "path-hit");
    this.#stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.#stroke.setAttribute("class", "path-stroke");
    this.#svg.append(this.#hit, this.#stroke);
    this.#shadow.append(this.#svg);

    this.#hit.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.dispatchEvent(
        new CustomEvent("linkpointerdown", {
          bubbles: true,
          composed: true,
          detail: { clientX: event.clientX, clientY: event.clientY },
        }),
      );
    });
  }

  get endpoints(): ConnectorEndpoints {
    return { from: this.#from, to: this.#to };
  }

  set endpoints(value: ConnectorEndpoints) {
    this.#from = value.from;
    this.#to = value.to;
    this.#layout();
  }

  get selected(): boolean {
    return this.hasAttribute("data-selected");
  }

  set selected(value: boolean) {
    this.toggleAttribute("data-selected", value);
  }

  get preview(): boolean {
    return this.hasAttribute("data-preview");
  }

  set preview(value: boolean) {
    this.toggleAttribute("data-preview", value);
  }

  pathData(): string {
    return this.#stroke.getAttribute("d") ?? "";
  }

  #layout(): void {
    const link = cubicLink(this.#from, this.#to);
    const box = cubicLinkBounds(link);
    this.style.left = `${box.left}px`;
    this.style.top = `${box.top}px`;
    this.style.width = `${box.width}px`;
    this.style.height = `${box.height}px`;
    this.#svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const d = translatePath(link, { x: box.left, y: box.top });
    this.#hit.setAttribute("d", d);
    this.#stroke.setAttribute("d", d);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "bld-connector": BldConnector;
  }
}
