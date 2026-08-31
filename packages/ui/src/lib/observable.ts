/**
 * Tiny EventTarget-based store. Subclasses declare fields and call
 * {@link defineFields} so assignments notify subscribers.
 */
export class ObservableState extends EventTarget {
  protected defineFields(fields: Record<string, unknown>): void {
    for (const [key, initial] of Object.entries(fields)) {
      let value = initial;
      Object.defineProperty(this, key, {
        get: () => value,
        set(next: unknown) {
          if (Object.is(value, next)) {
            return;
          }
          value = next;
          this.notify();
        },
        enumerable: true,
        configurable: true,
      });
    }
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
