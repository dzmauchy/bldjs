import { createHost } from "./host";

let buffer: number[] = [];
let handle: ReturnType<typeof setTimeout> | undefined;
let tick: (() => void) | undefined;

function stopInner(): void {
  if (handle !== undefined) {
    clearTimeout(handle);
  }
  handle = undefined;
  tick = undefined;
}

async function start(wasm: ArrayBuffer, delayMs: number): Promise<void> {
  stopInner();
  buffer = [];
  const { instance } = await WebAssembly.instantiate(wasm, createHost(buffer));
  const exported = instance.exports.tick;
  if (typeof exported !== "function") {
    throw new Error("generator wasm is missing exported tick");
  }
  tick = exported as () => void;
  const delay = Math.max(delayMs, 1);
  const loop = (): void => {
    tick?.();
    handle = setTimeout(loop, delay);
  };
  handle = setTimeout(loop, 0);
}

self.onmessage = (event: MessageEvent<{ type: string; wasm?: ArrayBuffer; delayMs?: number; id?: number }>) => {
  const msg = event.data;
  if (msg.type === "start" && msg.wasm) {
    void start(msg.wasm, msg.delayMs ?? 1);
    return;
  }
  if (msg.type === "snapshot") {
    self.postMessage({ type: "samples", id: msg.id, values: buffer.slice() });
    return;
  }
  if (msg.type === "stop") {
    stopInner();
  }
};
