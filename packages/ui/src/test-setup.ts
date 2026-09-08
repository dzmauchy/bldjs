if (typeof TextEncoder !== "undefined" && typeof Uint8Array !== "undefined") {
  const nodeUint8Array = new TextEncoder().encode("").constructor;
  if (!(new TextEncoder().encode("") instanceof Uint8Array)) {
    const origHasInstance = Function.prototype[Symbol.hasInstance];
    Object.defineProperty(Uint8Array, Symbol.hasInstance, {
      value(instance: unknown) {
        return (
          instance instanceof (nodeUint8Array as unknown as typeof Uint8Array) ||
          origHasInstance.call(this, instance)
        );
      },
      configurable: true,
    });
  }
}

if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

if (typeof ElementInternals !== "undefined") {
  const proto = ElementInternals.prototype as unknown as Record<string, unknown>;
  if (typeof proto.setValidity !== "function") {
    proto.setValidity = function () {};
  }
  if (typeof proto.setFormValue !== "function") {
    proto.setFormValue = function () {};
  }
  if (typeof proto.checkValidity !== "function") {
    proto.checkValidity = function () {
      return true;
    };
  }
  if (typeof proto.reportValidity !== "function") {
    proto.reportValidity = function () {
      return true;
    };
  }
  if (!Object.getOwnPropertyDescriptor(proto, "validity")) {
    Object.defineProperty(proto, "validity", {
      configurable: true,
      get() {
        return {
          valid: true,
          badInput: false,
          customError: false,
          patternMismatch: false,
          rangeOverflow: false,
          rangeUnderflow: false,
          stepMismatch: false,
          tooLong: false,
          tooShort: false,
          typeMismatch: false,
          valueMissing: false,
        };
      },
    });
  }
  if (!Object.getOwnPropertyDescriptor(proto, "states")) {
    Object.defineProperty(proto, "states", {
      configurable: true,
      get() {
        if (!this._states) {
          this._states = new Set();
        }
        return this._states;
      },
    });
  }
}

if (typeof HTMLDialogElement !== "undefined") {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
  }
  if (typeof HTMLDialogElement.prototype.show !== "function") {
    HTMLDialogElement.prototype.show = function () {
      this.setAttribute("open", "");
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  }
}

if (typeof Element !== "undefined") {
  if (typeof Element.prototype.getAnimations !== "function") {
    Element.prototype.getAnimations = function () {
      return [];
    };
  }
  if (typeof Element.prototype.animate !== "function") {
    Element.prototype.animate = function () {
      return {
        finished: Promise.resolve(),
        cancel: () => {},
        play: () => {},
        pause: () => {},
        reverse: () => {},
        finish: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as Animation;
    };
  }
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
