import { countFrom, defFrom, DEFAULT_COUNT, DEFAULT_VALUE } from "./ids";
import type { DoubleConsumer } from "./types";

/**
 * XML `(Double) -> Unit → Array[(Double) -> Unit]`.
 * Each returned consumer writes its slot, then pushes the product of all slots.
 * Unwired slots stay at `def` (default 1, the multiplicative identity).
 */
export function product(
  n: number = DEFAULT_COUNT,
  def: number = DEFAULT_VALUE,
  downStream: DoubleConsumer,
): DoubleConsumer[] {
  const count = countFrom(n);
  const initial = defFrom(def);
  const values = Array.from({ length: count }, () => initial);
  return values.map((_, index) => (value: number) => {
    values[index] = value;
    let p = 1;
    for (const item of values) {
      p *= item;
    }
    downStream(p);
  });
}
