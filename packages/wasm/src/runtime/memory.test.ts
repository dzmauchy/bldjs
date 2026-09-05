import { describe, expect, it } from "vitest";
import { SAMPLE_CAP as XML_SAMPLE_CAP } from "@bld/xml/blocks/cs/ids";
import { pushSample } from "./host";
import {
  SAMPLE_CAP,
  bumpFlowCount,
  bumpFlowCounts,
  createMemory,
  createSharedMemory,
  isStopped,
  readFlowCounts,
  readGpio,
  readLatest,
  readSamples,
  requestStop,
  writeGpio,
} from "./memory";

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
    bumpFlowCount(memory, 0);
    expect(readFlowCounts(memory, 2)).toEqual([3, 2]);
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
    expect(Number.isNaN(readLatest(memory))).toBe(true);
    expect(readSamples(memory)).toEqual([]);
    pushSample(memory, Math.sin(1), 0);
    pushSample(memory, Math.sin(2), 0);
    bumpFlowCounts(memory, 1);
    const samples = readSamples(memory);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toBeCloseTo(Math.sin(1));
    expect(samples[1]).toBeCloseTo(Math.sin(2));
    expect(readLatest(memory)).toBeCloseTo(Math.sin(2));
  });

  it("simulates GPIO pin levels in the shared page", () => {
    const memory = createMemory(false);
    expect(readGpio(memory, 0)).toBe(0);
    writeGpio(memory, 0, 1);
    expect(readGpio(memory, 0)).toBe(1);
    writeGpio(memory, 32, 1);
    expect(readGpio(memory, 0)).toBe(1);
    writeGpio(memory, 0, 0);
    expect(readGpio(memory, 32)).toBe(0);
  });
});
