import { bootGeneratorInstance } from "./boot";
import { requestStop } from "./memory";

// Stay off @bld/xml: DOMParser is not defined in workers, and pulling the
// catalog would leave the sample ring empty so the Scope plot never appears.

let memory: WebAssembly.Memory | undefined;
let stopTimers: (() => void) | undefined;

function clearTimer(): void {
  stopTimers?.();
  stopTimers = undefined;
}

async function start(
  wasm: ArrayBuffer,
  shared: WebAssembly.Memory,
  delayMs: number,
  connectorCount: number,
): Promise<void> {
  clearTimer();
  memory = shared;
  const gen = await bootGeneratorInstance(wasm, shared, { connectorCount });
  gen.start(delayMs);
  stopTimers = () => gen.stopTimers();
}

self.onmessage = (
  event: MessageEvent<{
    type: string;
    wasm?: ArrayBuffer;
    memory?: WebAssembly.Memory;
    delayMs?: number;
    connectorCount?: number;
  }>,
) => {
  const msg = event.data;
  if (msg.type === "start" && msg.wasm && msg.memory) {
    void start(msg.wasm, msg.memory, msg.delayMs ?? 1, msg.connectorCount ?? 0);
    return;
  }
  if (msg.type === "stop") {
    clearTimer();
    if (memory) {
      requestStop(memory);
    }
  }
};
