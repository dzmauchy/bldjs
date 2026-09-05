/** Little-endian ASCII "WASM" used by the MCU hot-reload header. */
export const WASM_MAGIC = 0x4d534157;

/** 8-byte framed packet: magic + length + raw `.wasm` bytes. */
export function wasmDeployFrame(wasm: Uint8Array): Uint8Array {
  const frame = new Uint8Array(8 + wasm.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, WASM_MAGIC, true);
  view.setUint32(4, wasm.byteLength, true);
  frame.set(wasm, 8);
  return frame;
}

export function canUseWebSerial(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export interface SerialLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

export interface SerialPortRequest {
  requestPort(): Promise<SerialLike>;
}

/**
 * WebSerial transport: deploy linear `wasm` to an MCU running the WAMR/RTOS runtime.
 */
export class McuTransport {
  port: SerialLike | null = null;
  writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  get connected(): boolean {
    return this.writer !== null;
  }

  async connect(serial: SerialPortRequest | undefined = navigatorSerial()): Promise<void> {
    if (!serial) {
      throw new Error("WebSerial is not available in this browser.");
    }
    this.port = await serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    if (!this.port.writable) {
      throw new Error("MCU serial port is not writable.");
    }
    this.writer = this.port.writable.getWriter();
  }

  async deploy(wasm: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error("Hardware not connected over USB.");
    }
    await this.writer.write(wasmDeployFrame(wasm));
  }

  async disconnect(): Promise<void> {
    try {
      this.writer?.releaseLock();
    } catch {
      // ignore
    }
    this.writer = null;
    if (this.port) {
      try {
        await this.port.close();
      } catch {
        // ignore
      }
    }
    this.port = null;
  }
}

function navigatorSerial(): SerialPortRequest | undefined {
  const serial = (globalThis as { navigator?: { serial?: SerialPortRequest } }).navigator?.serial;
  return serial;
}
