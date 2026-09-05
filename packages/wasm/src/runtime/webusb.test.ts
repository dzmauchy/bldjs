import { describe, expect, it } from "vitest";
import { McuTransport, WASM_MAGIC, canUseWebSerial, wasmDeployFrame } from "./webusb";

describe("MCU deploy framing", () => {
  it("prefixes the wasm bytes with little-endian WASM magic and length", () => {
    const wasm = new Uint8Array([0, 97, 115, 109, 1, 2, 3]);
    const frame = wasmDeployFrame(wasm);
    const view = new DataView(frame.buffer);
    expect(view.getUint32(0, true)).toBe(WASM_MAGIC);
    expect(String.fromCharCode(frame[0]!, frame[1]!, frame[2]!, frame[3]!)).toBe("WASM");
    expect(view.getUint32(4, true)).toBe(7);
    expect([...frame.slice(8)]).toEqual([...wasm]);
  });

  it("reports WebSerial availability from the environment", () => {
    expect(typeof canUseWebSerial()).toBe("boolean");
    const transport = new McuTransport();
    expect(transport.connected).toBe(false);
  });
});
