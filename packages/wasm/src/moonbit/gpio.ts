import { MoonBlock } from "./block";
import { CTX_PARAM, type MoonBlockEmit } from "./types";

function pinLit(opts: MoonBlockEmit): number {
  return opts.pin ?? 0;
}

/**
 * gpio_in — XML `(Double) -> Unit` generator. Samples `host_pin_read` as 0.0/1.0.
 */
export class GpioInMoonBlock extends MoonBlock {
  readonly defId = "gpio_in";

  emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    const pin = pinLit(opts);
    return `fn ${name}(${CTX_PARAM}, input : C1) -> Unit {
  input(if host_pin_read(${pin}) != 0 { 1.0 } else { 0.0 })
}
`;
  }
}

/**
 * gpio_out — XML `() → (Double) -> Unit`. Writes the pin HIGH when the sample is &gt; 0.5.
 */
export class GpioOutMoonBlock extends MoonBlock {
  readonly defId = "gpio_out";

  emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    const pin = pinLit(opts);
    return `fn ${name}(${CTX_PARAM}) -> C1 {
  fn(v : Double) { host_pin_write(${pin}, if v > 0.5 { 1 } else { 0 }) }
}
`;
  }
}

export const GPIO_IN_BLOCK = new GpioInMoonBlock();
export const GPIO_OUT_BLOCK = new GpioOutMoonBlock();

export function emitGpioIn(opts: MoonBlockEmit = {}): string {
  return GPIO_IN_BLOCK.emit(opts);
}

export function emitGpioOut(opts: MoonBlockEmit = {}): string {
  return GPIO_OUT_BLOCK.emit(opts);
}
