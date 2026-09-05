/** XML `c<f64>` as a MoonBit consumer. */
export const C1_TYPE = "C1";

/**
 * Extra runtime parameter, not an XML port.
 * The `_` prefix is MoonBit's unused binding, so bodies do not need `let _ = ctx`.
 */
export const CTX_PARAM = "_ctx : Int";

export interface MoonBlockEmit {
  /** MoonBit function name. Defaults to the XML block id. */
  name?: string;
  /** Dynamic array length (scope `out`). */
  length?: number;
  /** Ring index for each array slot. */
  rings?: readonly number[];
}

export type BlockScript = (opts?: MoonBlockEmit) => string;

/** One named MoonBit source file inside the generated `main` package. */
export type MoonbitFile = readonly [name: string, source: string];
