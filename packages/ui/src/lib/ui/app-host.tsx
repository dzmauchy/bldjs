import { render } from "solid-js/web";
import { createEffect, createSignal, untrack, type JSX } from "solid-js";
import { createReactiveApp } from "$lib/context";
import type { AppState } from "$lib/state";

export function defineElementProps<T extends HTMLElement>(el: T, defaults: Record<string, unknown>): void {
  for (const [key, initial] of Object.entries(defaults)) {
    const [get, set] = createSignal(initial);
    Object.defineProperty(el, key, { get, set: (v) => set(() => v), configurable: true, enumerable: true });
  }
}

export abstract class SolidElement extends HTMLElement {
  updateComplete: Promise<boolean> = Promise.resolve(true);
  protected disposeRoot?: () => void;
  get renderRoot(): HTMLElement { return this; }
  connectedCallback(): void { this.mount(); }
  disconnectedCallback(): void { this.unmount(); }
  requestUpdate(): void {}
  protected mount(): void {
    this.unmount();
    this.textContent = "";
    this.disposeRoot = render(() => untrack(() => this.render()), this);
  }
  protected unmount(): void {
    this.disposeRoot?.();
    this.disposeRoot = undefined;
  }
  abstract render(): JSX.Element;
}

/** Base custom element bound to a shared AppState. */
export abstract class AppHost extends SolidElement {
  static styles: unknown[] = [];
  readonly #rawApp = createSignal<AppState | undefined>(undefined);

  get rawApp(): AppState | undefined {
    return this.#rawApp[0]() ?? (this.closest("bld-app") as any)?.app;
  }
  set app(value: AppState) {
    this.#rawApp[1](() => value);
  }
  get app(): AppState {
    const raw = this.rawApp;
    return raw ? createReactiveApp(raw) : (undefined as unknown as AppState);
  }
  get reactiveApp(): AppState {
    return this.app;
  }

  protected override mount(): void {
    this.unmount();
    this.textContent = "";
    this.disposeRoot = render(() => {
      createEffect(() => this.toggleAttribute("data-compact", Boolean(this.app?.compactUi)));
      return untrack(() => this.render());
    }, this);
  }
}
