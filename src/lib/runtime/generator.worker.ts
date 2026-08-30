import { createHost } from "./host";
import { startTickLoop } from "./runner";
import { intervalMs } from "./flow";
import { requestStop } from "./memory";

let memory: WebAssembly.Memory | undefined;
let stopLoop: (() => void) | undefined;

function clearTimer(): void {
  stopLoop?.();
  stopLoop = undefined;
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
  const module = await WebAssembly.compile(bytes.buffer);
  const instance = await WebAssembly.instantiate(module, createHost(shared));
  const tick = instance.exports.tick;
  if (typeof tick !== "function") {
    throw new Error("generator wasm is missing exported tick");
  }
  const loop = startTickLoop(shared, tick as () => void, intervalMs(delayMs), connectorCount);
  stopLoop = loop.stop;
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
