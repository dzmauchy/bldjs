import { clampDouble, clampInt, clampPositiveInt } from "../../numeric";

/** Default generator quantization period (`integer-range-parameter` `period`). */
export const DEFAULT_PERIOD_MS = 10;
/** @deprecated Use {@link DEFAULT_PERIOD_MS}. */
export const QUANTIZER_DELAY_MS = DEFAULT_PERIOD_MS;

export const PERIOD_PARAM = "period";
export const PIN_PARAM = "pin";
export const ZETA_PARAM = "ζ";
export const WD_PARAM = "ωd";
export const WINDOW_PARAM = "n";
export const METER_PARAM = "m";
/** Damping ratio for the underdamped second-order step response (`double-range-parameter` `ζ`). */
export const DEFAULT_ZETA = 0.5;
export const MIN_ZETA = 0.05;
export const MAX_ZETA = 0.95;
/** Damped natural frequency in rad/s (`double-range-parameter` `ωd`). */
export const DEFAULT_WD = 1;
export const MIN_WD = 0.1;
export const MAX_WD = 20;
export const DEFAULT_PIN = 0;
export const MAX_PIN = 31;

/** Scope time-window width in seconds (`integer-range-parameter` `n`). */
export const DEFAULT_WINDOW_S = 30;
export const MIN_WINDOW_S = 10;
export const MAX_WINDOW_S = 600;
/** Scope quantizer period in milliseconds (`integer-range-parameter` `m`). */
export const DEFAULT_METER_MS = 10;
export const MIN_METER_MS = 10;
export const MAX_METER_MS = 1000;

export const GENERATOR_IDS = new Set(["timer", "random", "gpio_in"]);
/** Generators that fire on a quantization period. GPIO In samples on start and pin edges. */
export const QUANTIZED_GENERATOR_IDS = new Set(["timer", "random"]);
export const TRANSFORMER_IDS = new Set(["sin", "cos", "overshoot"]);
export const SINK_IDS = new Set(["scope", "gpio_out"]);
export const GPIO_IDS = new Set(["gpio_in", "gpio_out"]);

export function isGeneratorId(defId: string): boolean {
  return GENERATOR_IDS.has(defId);
}

export function isEventDrivenGenerator(defId: string): boolean {
  return defId === "gpio_in";
}

export function isQuantizedGenerator(defId: string): boolean {
  return QUANTIZED_GENERATOR_IDS.has(defId);
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

export function windowSecondsFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_WINDOW_S : Number(value);
  return clampInt(parsed, MIN_WINDOW_S, MAX_WINDOW_S, DEFAULT_WINDOW_S);
}

export function meterMsFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_METER_MS : Number(value);
  return clampInt(parsed, MIN_METER_MS, MAX_METER_MS, DEFAULT_METER_MS);
}

export function zetaFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_ZETA : Number(value);
  return clampDouble(parsed, MIN_ZETA, MAX_ZETA, DEFAULT_ZETA);
}

export function wdFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_WD : Number(value);
  return clampDouble(parsed, MIN_WD, MAX_WD, DEFAULT_WD);
}

/**
 * Sliding `Float64Array` capacity: `N` seconds at `1000 / M` samples per second.
 * Default `N = 30`, `M = 10` → 3000 measurements.
 */
export function sampleCap(
  n: number | string | undefined | null = DEFAULT_WINDOW_S,
  m: number | string | undefined | null = DEFAULT_METER_MS,
): number {
  return Math.max(1, Math.round((windowSecondsFrom(n) * 1000) / meterMsFrom(m)));
}

/** WASM generator event ring. The live Scope plot uses {@link sampleCap}, not this. */
export const SAMPLE_CAP = 480;
