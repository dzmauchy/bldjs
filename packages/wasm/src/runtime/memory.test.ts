import { describe, expect, it } from "vitest";
import { SAMPLE_CAP as XML_SAMPLE_CAP } from "@bld/xml/blocks/cs/ids";
import {
  SAMPLE_CAP,
  bumpFlowCounts,
  createMemory,
  createSharedMemory,
  isStopped,
  readFlowCounts,
  readSamples,
  requestStop,
  scopeCountAddr,
  scopeSamplesAddr,
} from "./memory";

function pushSample(memory: WebAssembly.Memory, value: number, ring = 0): void {
  const view = new DataView(memory.buffer);
  const countAddr = scopeCountAddr(ring);
  const samplesAddr = scopeSamplesAddr(ring);
  const count = view.getInt32(countAddr, true);
  view.setFloat64(samplesAddr + (count % SAMPLE_CAP) * 8, value, true);
  view.setInt32(countAddr, count + 1, true);
}

describe("runtime memory", () => {
  it("keeps the sample ring capacity aligned with the XML package", () => {
    expect(SAMPLE_CAP).toBe(XML_SAMPLE_CAP);
  });

  it("uses atomics on shared memory", () => {
    const memory = createSharedMemory();
    expect(memory.buffer instanceof SharedArrayBuffer).toBe(true);
    expect(isStopped(memory)).toBe(false);
    requestStop(memory);
    expect(isStopped(memory)).toBe(true);
    bumpFlowCounts(memory, 2);
    bumpFlowCounts(memory, 2);
    expect(readFlowCounts(memory, 2)).toEqual([2, 2]);
  });

  it("reads and writes stop/flow counts without SharedArrayBuffer", () => {
    const memory = createMemory(false);
    expect(memory.buffer instanceof SharedArrayBuffer).toBe(false);
    expect(isStopped(memory)).toBe(false);
    requestStop(memory);
    expect(isStopped(memory)).toBe(true);
    bumpFlowCounts(memory, 3);
    expect(readFlowCounts(memory, 3)).toEqual([1, 1, 1]);
  });

  it("reads scope rings after a shared-memory tick publishes flow counts", () => {
    const memory = createSharedMemory();
    expect(readSamples(memory)).toEqual([]);
    pushSample(memory, Math.sin(1));
    pushSample(memory, Math.sin(2));
    bumpFlowCounts(memory, 1);
    const samples = readSamples(memory);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toBeCloseTo(Math.sin(1));
    expect(samples[1]).toBeCloseTo(Math.sin(2));
  });
});
