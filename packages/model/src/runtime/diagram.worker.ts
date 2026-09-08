import { createRuntimeHost, runCompiledDiagram, type HostMessage } from "./host";

let host = createRuntimeHost({
  post(message) {
    self.postMessage(message);
  },
});

self.onmessage = (event: MessageEvent<{ type: string; js?: string; gpio?: Array<[number, number]>; connectorCount?: number; delayMs?: number; pin?: number; level?: number }>) => {
  const msg = event.data;
  if (msg.type === "start" && msg.js) {
    host.stop();
    const gpio = new Map(msg.gpio ?? []);
    host = createRuntimeHost({
      connectorCount: msg.connectorCount,
      delayMs: msg.delayMs,
      gpio,
      post(message: HostMessage) {
        self.postMessage(message);
      },
    });
    runCompiledDiagram(msg.js, host);
    return;
  }
  if (msg.type === "gpio" && msg.pin !== undefined && msg.level !== undefined) {
    host.setGpio(msg.pin, msg.level);
    return;
  }
  if (msg.type === "stop") {
    host.stop();
  }
};
