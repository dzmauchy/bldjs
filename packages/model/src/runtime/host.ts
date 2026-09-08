import { ConnectorIntrospector } from "../flow";

export interface BldHost {
  enter(id: number): void;
  currentBlock(): number;
  now(): number;
  random(): number;
  setInterval(cb: () => void, ms: number): number;
  clearInterval(id: number): void;
  tap(index: number, value: number): void;
  postScope(id: number, values: number[], windowS: number, meterMs: number): void;
  pinRead(pin: number): number;
  pinWrite(pin: number, value: number): void;
  onPinChange(pin: number, cb: () => void): void;
}

export type HostMessage =
  | { type: "scope"; id: number; values: number[]; windowS: number; meterMs: number }
  | { type: "frequency"; frequencies: number[] }
  | { type: "gpio"; pin: number; level: number };

export interface HostOptions {
  connectorCount?: number;
  delayMs?: number;
  gpio?: ReadonlyMap<number, number>;
  now?: () => number;
  random?: () => number;
  post: (message: HostMessage) => void;
}

export interface RuntimeHost extends BldHost {
  stop(): void;
  setGpio(pin: number, level: number): void;
  frequencies(nowMs?: number): number[];
}

export function createRuntimeHost(options: HostOptions): RuntimeHost {
  const pins = new Int32Array(32);
  if (options.gpio) {
    for (const [pin, level] of options.gpio) {
      if (pin >= 0 && pin < 32) {
        pins[pin] = level !== 0 ? 1 : 0;
      }
    }
  }
  const pinListeners = new Map<number, Array<() => void>>();
  const timers = new Set<ReturnType<typeof setInterval>>();
  let current = 0;
  let stopped = false;
  const introspector = new ConnectorIntrospector(options.connectorCount ?? 0, options.delayMs ?? 10, false);
  const now = options.now ?? (() => Date.now() / 1000);
  const random = options.random ?? Math.random;

  const notifyFrequency = (): void => {
    if (stopped) {
      return;
    }
    options.post({ type: "frequency", frequencies: introspector.advance() });
  };

  const host: RuntimeHost = {
    enter(id: number) {
      current = id;
    },
    currentBlock() {
      return current;
    },
    now,
    random,
    setInterval(cb, ms) {
      const delay = Math.max(1, Math.trunc(ms) || 1);
      cb();
      const id = setInterval(() => {
        if (stopped) {
          clearInterval(id);
          return;
        }
        cb();
        notifyFrequency();
      }, delay);
      timers.add(id);
      return id as unknown as number;
    },
    clearInterval(id) {
      const handle = id as unknown as ReturnType<typeof setInterval>;
      clearInterval(handle);
      timers.delete(handle);
    },
    tap(index, value) {
      introspector.observe(index, value);
    },
    postScope(id, values, windowS, meterMs) {
      if (stopped) {
        return;
      }
      options.post({ type: "scope", id, values: values.slice(), windowS, meterMs });
    },
    pinRead(pin) {
      return pins[pin] ?? 0;
    },
    pinWrite(pin, value) {
      const next = value !== 0 ? 1 : 0;
      pins[pin] = next;
      options.post({ type: "gpio", pin, level: next });
    },
    onPinChange(pin, cb) {
      const list = pinListeners.get(pin) ?? [];
      list.push(cb);
      pinListeners.set(pin, list);
    },
    setGpio(pin, level) {
      const next = level !== 0 ? 1 : 0;
      const prev = pins[pin] ?? 0;
      pins[pin] = next;
      if (prev !== next) {
        for (const cb of pinListeners.get(pin) ?? []) {
          cb();
        }
      }
    },
    frequencies(nowMs) {
      if (nowMs !== undefined) {
        return introspector.advance(nowMs);
      }
      return introspector.frequencies();
    },
    stop() {
      stopped = true;
      for (const id of timers) {
        clearInterval(id);
      }
      timers.clear();
    },
  };
  return host;
}

export function runCompiledDiagram(js: string, host: BldHost): void {
  const global = globalThis as typeof globalThis & { host: BldHost };
  global.host = host;
  const exports: Record<string, unknown> = {};
  const body = `"use strict";\n${js}\n`;
  const fn = new Function("host", "exports", body);
  fn(host, exports);
}
