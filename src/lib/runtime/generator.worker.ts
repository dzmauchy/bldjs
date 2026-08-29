import { createHost } from "./host";
import { requestStop } from "./memory";

let memory: WebAssembly.Memory | undefined;

async function start(wasm: ArrayBuffer, shared: WebAssembly.Memory): Promise<void> {
  memory = shared;
  const bytes = new Uint8Array(wasm);
  const module = await WebAssembly.compile(bytes.buffer);
  const instance = await WebAssembly.instantiate(module, createHost(shared));
  const run = instance.exports.run;
  if (typeof run !== "function") {
    throw new Error("generator wasm is missing exported run");
  }
  (run as () => void)();
}

self.onmessage = (event: MessageEvent<{ type: string; wasm?: ArrayBuffer; memory?: WebAssembly.Memory }>) => {
  const msg = event.data;
  if (msg.type === "start" && msg.wasm && msg.memory) {
    void start(msg.wasm, msg.memory);
    return;
  }
  if (msg.type === "stop") {
    if (memory) {
      requestStop(memory);
    }
  }
};
