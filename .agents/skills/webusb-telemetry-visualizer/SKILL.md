---
name: webusb-telemetry-visualizer
description: Browser-side IDE engine that manages WebSerial/WebUSB connections, deploys MoonBit .wasm binaries to MCU RAM, and parses 200 Hz telemetry for real-time Canvas rendering.
version: 1.0.0
tags:
  - webusb
  - webserial
  - transport
  - visualizer
  - canvas
---

# WebUSB/WebSerial Transport & Telemetry Visualizer

This skill implements the browser-side hardware interface. It deploys `.wasm` binaries directly into microcontroller RAM and decodes incoming binary telemetry frames.

## IDE Controller (`ide_controller.js`)

```javascript
export class EmbeddedIDEController {
  constructor(onTelemetryCallback) {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.onTelemetry = onTelemetryCallback;
    this.rxBuffer = new Uint8Array(4096);
    this.rxHead = 0;
  }

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    this.startReadPump();
  }

  async deployWasm(wasmBinary) {
    if (!this.writer) throw new Error("Hardware not connected over USB.");

    // Command Header: [0x57, 0x41, 0x53, 0x4D ("WASM")] + [Length (uint32_le)]
    const header = new ArrayBuffer(8);
    const view = new DataView(header);
    view.setUint32(0, 0x4D534157, true);
    view.setUint32(4, wasmBinary.byteLength, true);

    await this.writer.write(new Uint8Array(header));
    await this.writer.write(wasmBinary);
  }

  async startReadPump() {
    this.reader = this.port.readable.getReader();

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;

        this.rxBuffer.set(value, this.rxHead);
        this.rxHead += value.length;
        this.processStream();
      }
    } finally {
      this.reader.releaseLock();
    }
  }

  processStream() {
    let cursor = 0;
    const FRAME_SIZE = 10;

    while (cursor <= this.rxHead - FRAME_SIZE) {
      if (this.rxBuffer[cursor] === 0xAA && this.rxBuffer[cursor + 1] === 0x55) {
        const type = this.rxBuffer[cursor + 2];
        const seq = this.rxBuffer[cursor + 3];
        const rawAdc = this.rxBuffer[cursor + 4] | (this.rxBuffer[cursor + 5] << 8);
        const filtAdc = this.rxBuffer[cursor + 6] | (this.rxBuffer[cursor + 7] << 8);
        const gpio = this.rxBuffer[cursor + 8];
        const checksum = this.rxBuffer[cursor + 9];

        let chk = 0;
        for (let j = cursor + 2; j <= cursor + 8; j++) {
          chk ^= this.rxBuffer[j];
        }

        if (chk === checksum) {
          this.onTelemetry?.({
            type,
            seq,
            rawVoltage: (rawAdc / 4095.0) * 3.3,
            filteredVoltage: (filtAdc / 4095.0) * 3.3,
            gpio
          });
          cursor += FRAME_SIZE;
          continue;
        }
      }
      cursor++;
    }

    if (cursor > 0) {
      this.rxBuffer.copyWithin(0, cursor, this.rxHead);
      this.rxHead -= cursor;
    }
  }
}
```

## Oscilloscope Component (`scope.js`)

```javascript
export function initOscilloscope(canvas, bufferSize = 500) {
  const ctx = canvas.getContext("2d");
  const history = new Array(bufferSize).fill(0);

  function pushSample(voltage) {
    history.push(voltage);
    history.shift();
  }

  function render() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, h);

    // Baseline
    ctx.strokeStyle = "#27272a";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Signal trace
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = (i / history.length) * w;
      const y = h - (history[i] / 3.3) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
  return { pushSample };
}
```