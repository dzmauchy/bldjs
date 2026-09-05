import { SAMPLE_CAP, isStopped, requestStop, scopeCountAddr, scopeSamplesAddr } from "./memory";
import { interceptConsumerFrequency } from "./runner";

function tickDelayMs(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return 1;
  }
  return Math.max(1, Math.trunc(delayMs));
}

/** Write one sample into the JS-owned ring (MoonBit wasm-gc has its own tiny memory). */
export function pushSample(memory: WebAssembly.Memory, value: number, ring: number): void {
  const view = new DataView(memory.buffer);
  const countAddr = scopeCountAddr(ring);
  const samplesAddr = scopeSamplesAddr(ring);
  const index = view.getInt32(countAddr, true);
  view.setFloat64(samplesAddr + (index % SAMPLE_CAP) * 8, value, true);
  view.setInt32(countAddr, index + 1, true);
}

export interface HostOptions {
  now?: () => number;
  connectorCount?: number;
}

export interface WasmHost {
  imports: WebAssembly.Imports;
  stopTimers(): void;
  fire(): void;
}

/**
 * Imports for a MoonBit wasm-gc generator.
 * Math/Date are browser bindings (`fn sin = "Math" "sin"`). `js.setInterval` is
 * the browser timer. `host.push` writes the sample ring. `moonbit:ffi.make_closure`
 * lets `start` pass `tick` into `setInterval`.
 */
export function createHost(memory: WebAssembly.Memory, options: HostOptions = {}): WasmHost {
  const nowSecs = options.now ?? (() => Date.now() / 1000);
  const connectorCount = options.connectorCount ?? 0;
  const timers = new Set<ReturnType<typeof setInterval>>();
  let intervalFire: (() => void) | undefined;

  const fire = (): void => {
    if (intervalFire) {
      intervalFire();
      return;
    }
  };

  const imports: WebAssembly.Imports = {
    Math: Math as unknown as WebAssembly.ModuleImports,
    Date: {
      now: () => nowSecs() * 1000,
    },
    js: {
      setInterval(cb: () => void, ms: number): number {
        const run = (): void => {
          if (isStopped(memory)) {
            return;
          }
          cb();
          interceptConsumerFrequency(memory, connectorCount);
        };
        intervalFire = run;
        run();
        const delay = tickDelayMs(ms);
        const id = setInterval(() => {
          if (isStopped(memory)) {
            clearInterval(id);
            timers.delete(id);
            return;
          }
          run();
        }, delay);
        timers.add(id);
        return 0;
      },
    },
    host: {
      push(value: number, ring: number): void {
        pushSample(memory, value, ring);
      },
    },
    "moonbit:ffi": {
      make_closure: (fn: (...args: unknown[]) => unknown, closure: unknown) => fn.bind(null, closure),
    },
  };

  return {
    imports,
    fire,
    stopTimers() {
      for (const id of timers) {
        clearInterval(id);
      }
      timers.clear();
      requestStop(memory);
    },
  };
}
