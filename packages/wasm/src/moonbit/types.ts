/** XML `(Double) -> Unit` as a MoonBit consumer. */
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
  /** GPIO pin number baked into gpio_in / gpio_out. */
  pin?: number;
  /** Constant generator sample baked into `input(value)`. */
  value?: number;
  /** Product default factor for each output slot. */
  def?: number;
  /** Overshoot damping ratio `ζ` baked into the map. */
  zeta?: number;
  /** Overshoot natural frequency `ω` baked into the map. Damped frequency is `ωd = ω√(1−ζ²)`. */
  omega?: number;
  /** When true, overshoot treats input as elapsed time (from timer). When false, input is a signal and overshoot steps on transitions. Defaults to true. */
  timeInput?: boolean;
}

export type BlockScript = (opts?: MoonBlockEmit) => string;

/** One named MoonBit source file inside the generated package. */
export type MoonbitFile = readonly [name: string, source: string];
