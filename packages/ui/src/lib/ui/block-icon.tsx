import { createEffect, type JSX } from "solid-js";
import { renderIconSvg } from "$lib/flow/icons";
import { defineElementProps, SolidElement } from "./app-host";

export class BldBlockIcon extends SolidElement {
  declare name: string | null;

  constructor() {
    super();
    defineElementProps(this, { name: null });
  }

  static get observedAttributes() {
    return ["name"];
  }

  attributeChangedCallback(name: string, _oldVal: string, newVal: string) {
    if (name === "name") {
      this.name = newVal;
    }
  }

  override render(): JSX.Element {
    createEffect(() => {
      this.innerHTML = renderIconSvg(this.name ?? this.getAttribute("name"));
    });
    return null;
  }
}

customElements.define("bld-block-icon", BldBlockIcon);

declare global {
  interface HTMLElementTagNameMap {
    "bld-block-icon": BldBlockIcon;
  }
}
