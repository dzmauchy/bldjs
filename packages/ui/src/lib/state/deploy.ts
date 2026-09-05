import { canUseWebSerial, McuTransport } from "@bld/wasm/runtime/webusb";
import { HostedState } from "../observable";

export interface DeployHost {
  notify(): void;
  prodWasm(): Uint8Array | null;
}

/** WebSerial/WebUSB MCU flashing. Compiles to linear `wasm` on Run; this sends that binary. */
export class DeploySession extends HostedState<DeployHost> {
  readonly transport = new McuTransport();
  declare connecting: boolean;
  declare error: string | null;

  constructor(host: DeployHost) {
    super(host);
    this.defineFields({ connecting: false, error: null });
  }

  available(): boolean {
    return canUseWebSerial();
  }

  get connected(): boolean {
    return this.transport.connected;
  }

  async connect(): Promise<void> {
    if (!this.available()) {
      this.error = "WebSerial is not available in this browser.";
      return;
    }
    this.connecting = true;
    try {
      await this.transport.connect();
      this.error = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "MCU connect failed";
    } finally {
      this.connecting = false;
    }
  }

  async deploy(): Promise<void> {
    const wasm = this.host.prodWasm();
    if (!wasm) {
      this.error = "Run the diagram first so the MCU wasm module is compiled.";
      return;
    }
    if (!this.connected) {
      await this.connect();
    }
    if (!this.connected) {
      return;
    }
    try {
      await this.transport.deploy(wasm);
      this.error = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "MCU deploy failed";
    }
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.host.notify();
  }
}
