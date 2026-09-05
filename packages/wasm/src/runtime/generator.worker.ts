import { bootGeneratorInstance, type InstantiatedGenerator } from "./boot";
import { requestStop } from "./memory";

// Stay off @bld/xml: DOMParser is not defined in workers, and pulling the
// catalog would leave the sample ring empty so the Scope plot never appears.

let memory: WebAssembly.Memory | undefined;
let gen: InstantiatedGenerator | undefined;
let stopTimers: (() => void) | undefined;

function clearTimer(): void {
  stopTimers?.();
  stopTimers = undefined;
}

async function start(
  wasm: ArrayBuffer,
  shared: WebAssembly.Memory,
  delayMs: number,
  count: number,
  eventDriven: boolean,
): Promise<void> {
  clearTimer();
  memory = shared;
  gen = await bootGeneratorInstance(wasm, shared, { connectorCount: count });
  if (eventDriven) {
    stopTimers = () => {
      if (memory) {
        requestStop(memory);
      }
    };
    return;
  }
  gen.start(delayMs);
  stopTimers = () => gen?.stopTimers();
}

self.onmessage = (
  event: MessageEvent<{
    type: string;
    wasm?: ArrayBuffer;
    memory?: WebAssembly.Memory;
    delayMs?: number;
    connectorCount?: number;
    eventDriven?: boolean;
  }>,
) => {
  const msg = event.data;
  if (msg.type === "start" && msg.wasm && msg.memory) {
    void start(msg.wasm, msg.memory, msg.delayMs ?? 1, msg.connectorCount ?? 0, msg.eventDriven === true);
    return;
  }
  if (msg.type === "tick") {
    gen?.tick();
    return;
  }
  if (msg.type === "stop") {
    clearTimer();
    gen = undefined;
    if (memory) {
      requestStop(memory);
    }
  }
};
