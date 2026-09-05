import { clampPositiveInt } from "../../numeric";

/** Default generator quantization period (`integer-range-parameter` `period`). */
export const DEFAULT_PERIOD_MS = 10;
/** @deprecated Use {@link DEFAULT_PERIOD_MS}. */
export const QUANTIZER_DELAY_MS = DEFAULT_PERIOD_MS;

export const PERIOD_PARAM = "period";

export const GENERATOR_IDS = new Set(["timer", "random"]);
export const TRANSFORMER_IDS = new Set(["sin", "cos"]);

export function isGeneratorId(defId: string): boolean {
  return GENERATOR_IDS.has(defId);
}

export function isTransformerId(defId: string): boolean {
  return TRANSFORMER_IDS.has(defId);
}

export function periodMsFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_PERIOD_MS : Number(value);
  return clampPositiveInt(parsed, DEFAULT_PERIOD_MS);
}

/** Shared sample ring capacity for CS scope buffers and the WASM runner. */
export const SAMPLE_CAP = 480;
