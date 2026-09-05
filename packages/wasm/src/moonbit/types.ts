/** XML `c<f64>` as a MoonBit consumer. */
export const C1_TYPE = "C1";

export interface MoonBlockEmit {
  /** MoonBit function name. Defaults to the XML block id. */
  name?: string;
  /** Dynamic array length (scope `out`). */
  length?: number;
  /** Ring index for each array slot. */
  rings?: readonly number[];
}

export type BlockScript = (opts?: MoonBlockEmit) => string;
