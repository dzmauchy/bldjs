import { LitElement, css, html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { iconSvgInner } from "$lib/flow/icons";

export class BldBlockIcon extends LitElement {
  static override properties = {
    name: { type: String },
  };

  declare name: string | null;

  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    svg {
      width: 1em;
      height: 1em;
      flex: 0 0 auto;
      stroke: currentColor;
      stroke-width: 1.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      overflow: visible;
    }
  `;

  constructor() {
    super();
    this.name = null;
  }

  protected override render() {
    return html`
      <svg class="block-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        ${unsafeHTML(iconSvgInner(this.name))}
      </svg>
    `;
  }
}

customElements.define("bld-block-icon", BldBlockIcon);

declare global {
  interface HTMLElementTagNameMap {
    "bld-block-icon": BldBlockIcon;
  }
}
