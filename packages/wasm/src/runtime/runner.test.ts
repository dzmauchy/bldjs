import { describe, expect, it } from "vitest";
import { createSharedMemory, readFlowCounts } from "./memory";
import { interceptConsumerFrequency, startTickLoop } from "./runner";

describe("generator runner", () => {
  it("intercepts c<?> frequency without the runtime ticking", () => {
    const memory = createSharedMemory();
    interceptConsumerFrequency(memory, 3);
    interceptConsumerFrequency(memory, 3);
    expect(readFlowCounts(memory, 3)).toEqual([2, 2, 2]);
    expect(readFlowCounts(memory, 4)[3]).toBe(0);
  });

  it("counts connector invocations on each runner tick", () => {
    const memory = createSharedMemory();
    let ticks = 0;
    const loop = startTickLoop(memory, () => {
      ticks += 1;
    }, 10_000, 2);
    expect(ticks).toBe(1);
    expect(readFlowCounts(memory, 2)).toEqual([1, 1]);
    loop.fire();
    expect(ticks).toBe(2);
    expect(readFlowCounts(memory, 2)).toEqual([2, 2]);
    loop.stop();
    loop.fire();
    expect(ticks).toBe(2);
  });
});
