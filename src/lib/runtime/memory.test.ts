import { describe, expect, it } from "vitest";
import {
  bumpFlowCounts,
  createMemory,
  createSharedMemory,
  isStopped,
  readFlowCounts,
  requestStop,
} from "./memory";

describe("runtime memory", () => {
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
});
