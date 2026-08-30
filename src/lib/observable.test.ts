import { describe, expect, it } from "vitest";
import { ObservableState } from "./observable";

class Sample extends ObservableState {
  declare count: number;
  declare label: string;

  constructor() {
    super();
    this.defineFields({ count: 0, label: "a" });
  }
}

describe("ObservableState", () => {
  it("notifies subscribers when a defined field changes", () => {
    const state = new Sample();
    const seen: number[] = [];
    const stop = state.subscribe(() => seen.push(state.count));
    state.count = 1;
    state.count = 1;
    state.label = "b";
    stop();
    state.count = 2;
    expect(seen).toEqual([1, 1]);
  });
});
