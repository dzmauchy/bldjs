import { createHost } from "./host";
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
  const bytes = new Uint8Array(wasm);
  const host = createHost(shared, { connectorCount });
  const module = await WebAssembly.compile(bytes.buffer);
  const instance = await WebAssembly.instantiate(module, host.imports);
  const startTick = instance.exports.start;
  if (typeof startTick !== "function") {
    throw new Error("generator wasm is missing exported start");
  }
  (startTick as (delayMs: number) => void)(delayMs);
  stopTimers = () => host.stopTimers();
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
