import { ConnectorIntrospector } from "@bld/xml/flow";
import {
  SAMPLE_CAP,
  bumpFlowCount,
  isStopped,
  readGpio,
  requestStop,
  scopeCountAddr,
  scopeSamplesAddr,
  writeGpio,
} from "./memory";
import { startQuantizedLoop } from "./tick";

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
 * the browser timer. `host.push` writes the sample ring. `host.tap` records
 * connector value changes. `moonbit:ffi.make_closure` lets `start` pass `tick`
 * into `setInterval`. `host.pin_read` / `pin_write` simulate GPIO in the browser.
 */
export function createHost(memory: WebAssembly.Memory, options: HostOptions = {}): WasmHost {
  const nowSecs = options.now ?? (() => Date.now() / 1000);
  const connectorCount = options.connectorCount ?? 0;
  const introspector = new ConnectorIntrospector(connectorCount);
  const timers = new Set<() => void>();
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
        const loop = startQuantizedLoop({
          delayMs: ms,
          isStopped: () => isStopped(memory),
          fire() {
            cb();
          },
        });
        intervalFire = loop.fire;
        timers.add(loop.stop);
        return 0;
      },
    },
    host: {
      push(value: number, ring: number): void {
        pushSample(memory, value, ring);
      },
      tap(value: number, index: number): void {
        if (introspector.observe(index, value)) {
          bumpFlowCount(memory, index);
        }
      },
      pin_read(pin: number): number {
        return readGpio(memory, pin);
      },
      pin_write(pin: number, val: number): void {
        writeGpio(memory, pin, val);
      },
      pin_mode(_pin: number, _mode: number): void {},
    },
    "moonbit:ffi": {
      make_closure: (fn: (...args: unknown[]) => unknown, closure: unknown) => fn.bind(null, closure),
    },
  };

  return {
    imports,
    fire,
    stopTimers() {
      for (const stop of timers) {
        stop();
      }
      timers.clear();
      requestStop(memory);
    },
  };
}
