import { createHost } from "./host";
import { intervalMs } from "./flow";
import { isStopped, requestStop } from "./memory";

let memory: WebAssembly.Memory | undefined;
let interval: ReturnType<typeof setInterval> | undefined;

function clearTimer(): void {
  if (interval === undefined) {
    return;
  }
  clearInterval(interval);
  interval = undefined;
}

async function start(wasm: ArrayBuffer, shared: WebAssembly.Memory, delayMs: number): Promise<void> {
  clearTimer();
  memory = shared;
  const bytes = new Uint8Array(wasm);
  const module = await WebAssembly.compile(bytes.buffer);
  const instance = await WebAssembly.instantiate(module, createHost(shared));
  const tick = instance.exports.tick;
  if (typeof tick !== "function") {
    throw new Error("generator wasm is missing exported tick");
  }
  const fire = tick as () => void;
  const delay = intervalMs(delayMs);
  const step = (): void => {
    if (!memory || isStopped(memory)) {
      clearTimer();
      return;
    }
    fire();
  };
  step();
  interval = setInterval(step, delay);
}

self.onmessage = (
  event: MessageEvent<{ type: string; wasm?: ArrayBuffer; memory?: WebAssembly.Memory; delayMs?: number }>,
) => {
  const msg = event.data;
  if (msg.type === "start" && msg.wasm && msg.memory) {
    void start(msg.wasm, msg.memory, msg.delayMs ?? 1);
    return;
  }
  if (msg.type === "stop") {
    clearTimer();
    if (memory) {
      requestStop(memory);
    }
  }
};
