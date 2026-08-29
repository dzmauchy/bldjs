import { describe, expect, it } from "vitest";
import { compileGenerator, generatorWat } from "../blocks/cs";
import { createHost } from "./host";
import { instantiateGenerator, startLocalGenerator } from "./generator";
import { wat2wasm } from "./wabt";

describe("wabt generators", () => {
  it("compiles typed-function wat and ticks sin(pi/2)", async () => {
    const wat = generatorWat(["quantizer", "sin"]);
    const wasm = await wat2wasm(wat);
    expect(wasm.byteLength).toBeGreaterThan(8);
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);

    const buffer: number[] = [];
    let now = Math.PI / 2;
    const tick = await instantiateGenerator(wasm, buffer, () => now);
    tick();
    expect(buffer).toHaveLength(1);
    expect(Math.abs(buffer[0] - 1)).toBeLessThan(1e-9);
    now = 0;
    tick();
    expect(Math.abs(buffer[1])).toBeLessThan(1e-9);
  });

  it("runs a compiled timer pipeline in-process", async () => {
    const compiled = compileGenerator(
      4,
      [
        { id: 1, defId: "oscilloscope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "quantizer" },
        { id: 4, defId: "timer" },
      ],
      [
        { fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in" },
        { fromBlock: 3, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" },
      ],
    )!;
    const wasm = await wat2wasm(compiled.wat);
    const handle = await startLocalGenerator({
      wasm,
      delayMs: 1,
      now: () => Math.PI / 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const samples = await handle.snapshot();
    handle.stop();
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((value) => Math.abs(value - 1) < 1e-9)).toBe(true);
  });

  it("host push caps the sample buffer", () => {
    const buffer: number[] = [];
    const host = createHost(buffer);
    for (let i = 0; i < 500; i += 1) {
      host.host.push(i);
    }
    expect(buffer.length).toBe(480);
    expect(buffer[0]).toBe(20);
  });
});
