import type { ReactiveController, ReactiveControllerHost } from "lit";
import { APP_STATE_KEY, type AppState } from "./state";

export { APP_STATE_KEY };

/** Re-renders a Lit host whenever `app` notifies. */
export class AppController implements ReactiveController {
  #unsub?: () => void;

  constructor(
    private readonly host: ReactiveControllerHost,
    readonly app: AppState,
  ) {
    this.host.addController(this);
  }

  hostConnected(): void {
    this.#unsub = this.app.subscribe(() => this.host.requestUpdate());
  }

  hostDisconnected(): void {
    this.#unsub?.();
    this.#unsub = undefined;
  }
}
