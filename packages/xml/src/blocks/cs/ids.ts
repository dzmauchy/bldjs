import { clampInt, clampPositiveInt } from "../../numeric";

/** Default generator quantization period (`integer-range-parameter` `period`). */
export const DEFAULT_PERIOD_MS = 10;
/** @deprecated Use {@link DEFAULT_PERIOD_MS}. */
export const QUANTIZER_DELAY_MS = DEFAULT_PERIOD_MS;

export const PERIOD_PARAM = "period";
export const PIN_PARAM = "pin";
export const WINDOW_PARAM = "n";
export const METER_PARAM = "m";
export const DEFAULT_PIN = 0;
export const MAX_PIN = 31;

/** Scope sliding-buffer length (`integer-range-parameter` `n`). */
export const DEFAULT_SAMPLE_COUNT = 30;
export const MIN_SAMPLE_COUNT = 10;
export const MAX_SAMPLE_COUNT = 600;
/** Scope sampling period in milliseconds (`integer-range-parameter` `m`). */
export const DEFAULT_METER_MS = 10;
export const MIN_METER_MS = 10;
export const MAX_METER_MS = 1000;

export const GENERATOR_IDS = new Set(["timer", "random", "gpio_in"]);
/** Generators that fire on a quantization period. GPIO In is edge-driven instead. */
export const QUANTIZED_GENERATOR_IDS = new Set(["timer", "random"]);
export const TRANSFORMER_IDS = new Set(["sin", "cos"]);
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

export function sampleCountFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_SAMPLE_COUNT : Number(value);
  return clampInt(parsed, MIN_SAMPLE_COUNT, MAX_SAMPLE_COUNT, DEFAULT_SAMPLE_COUNT);
}

export function meterMsFrom(value: number | string | undefined | null): number {
  const parsed = typeof value === "number" ? value : value == null ? DEFAULT_METER_MS : Number(value);
  return clampInt(parsed, MIN_METER_MS, MAX_METER_MS, DEFAULT_METER_MS);
}

/** Sliding `Float64Array` capacity: Scope parameter `n`. */
export function sampleCap(n: number | string | undefined | null = DEFAULT_SAMPLE_COUNT): number {
  return sampleCountFrom(n);
}

/** WASM generator event ring. The live Scope plot uses {@link sampleCap}, not this. */
export const SAMPLE_CAP = 480;
