import { clampInt, clampPositiveInt } from "../../numeric";

/** Default generator quantization period (`integer-range-parameter` `period`). */
export const DEFAULT_PERIOD_MS = 10;
/** @deprecated Use {@link DEFAULT_PERIOD_MS}. */
export const QUANTIZER_DELAY_MS = DEFAULT_PERIOD_MS;

export const PERIOD_PARAM = "period";
export const PIN_PARAM = "pin";
export const DEFAULT_PIN = 0;
export const MAX_PIN = 31;

export const GENERATOR_IDS = new Set(["timer", "random", "gpio_in"]);
export const TRANSFORMER_IDS = new Set(["sin", "cos"]);
export const SINK_IDS = new Set(["scope", "gpio_out"]);
export const GPIO_IDS = new Set(["gpio_in", "gpio_out"]);

export function isGeneratorId(defId: string): boolean {
  return GENERATOR_IDS.has(defId);
}

export function isTransformerId(defId: string): boolean {
  return TRANSFORMER_IDS.has(defId);
}

export function isSinkId(defId: string): boolean {
  return SINK_IDS.has(defId);
}

export function isGpioId(defId: string): boolean {
  return GPIO_IDS.has(defId);
}

export function periodMsFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_PERIOD_MS : Number(value);
  return clampPositiveInt(parsed, DEFAULT_PERIOD_MS);
}

export function pinFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_PIN : Number(value);
  return clampInt(parsed, DEFAULT_PIN, MAX_PIN, DEFAULT_PIN);
}

/** Shared sample ring capacity for CS scope buffers and the WASM runner. */
export const SAMPLE_CAP = 480;
