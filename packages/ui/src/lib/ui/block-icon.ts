import { LitElement, html } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { renderIconSvg } from "$lib/flow/icons";

export class BldBlockIcon extends LitElement {
  static override properties = {
    name: { type: String },
  };

  declare name: string | null;

  override createRenderRoot(): HTMLElement {
    return this;
  }

  constructor() {
    super();
    this.name = null;
  }

  protected override render() {
    return html`${unsafeSVG(renderIconSvg(this.name))}`;
  }
}

customElements.define("bld-block-icon", BldBlockIcon);

declare global {
  interface HTMLElementTagNameMap {
    "bld-block-icon": BldBlockIcon;
  }
}
