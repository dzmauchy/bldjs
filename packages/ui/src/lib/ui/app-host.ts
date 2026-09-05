import { LitElement, type PropertyValues } from "lit";
import { AppController } from "$lib/context";
import type { AppState } from "$lib/state";

/** Lit chrome bound to a shared {@link AppState}. */
export class AppHost extends LitElement {
  static override properties = {
    app: { attribute: false },
  };

  declare app: AppState;
  #ctrl?: AppController;

  constructor() {
    super();
    this.app = undefined as unknown as AppState;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.bindApp();
  }

  protected override willUpdate(_changed?: PropertyValues): void {
    this.bindApp();
  }

  protected override updated(_changed?: PropertyValues): void {
    this.syncCompact();
  }

  protected syncCompact(): void {
    this.toggleAttribute("data-compact", this.app?.compactUi ?? false);
  }

  protected bindApp(): void {
    if (!this.app || this.#ctrl?.app === this.app) {
      return;
    }
    this.#ctrl?.detach();
    this.#ctrl = new AppController(this, this.app);
  }
}
