/**
 * Tiny EventTarget-based store. Subclasses declare fields and call
 * {@link defineFields} so assignments notify subscribers.
 */

export function defineNotifyingFields(
  target: object,
  fields: Record<string, unknown>,
  notify: () => void,
): void {
  for (const [key, initial] of Object.entries(fields)) {
    let value = initial;
    Object.defineProperty(target, key, {
      get: () => value,
      set(next: unknown) {
        if (Object.is(value, next)) {
          return;
        }
        value = next;
        notify();
      },
      enumerable: true,
      configurable: true,
    });
  }
}

export class ObservableState extends EventTarget {
  protected defineFields(fields: Record<string, unknown>): void {
    defineNotifyingFields(this, fields, () => this.notify());
  }

  subscribe(listener: () => void): () => void {
    const wrapped = (): void => {
      listener();
    };
    this.addEventListener("change", wrapped);
    return () => this.removeEventListener("change", wrapped);
  }

  notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}

/** Session owned by an {@link ObservableState} host; field writes notify that host. */
export class HostedState<H extends { notify(): void } = { notify(): void }> {
  constructor(protected readonly host: H) {}

  protected defineFields(fields: Record<string, unknown>): void {
    defineNotifyingFields(this, fields, () => this.host.notify());
  }
}
