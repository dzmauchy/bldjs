import { MoonBlock } from "./block";
import type { MoonbitTarget } from "./compile";
import { CTX_PARAM, type MoonBlockEmit } from "./types";

function pinLit(opts: MoonBlockEmit): number {
  return opts.pin ?? 0;
}

/**
 * Abstract GPIO In block. Samples host_pin_read as 0.0/1.0.
 */
export abstract class AbstractGpioInBlock extends MoonBlock {
  readonly defId = "gpio_in";
  abstract readonly target?: MoonbitTarget;

  emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    const pin = pinLit(opts);
    return `fn ${name}(${CTX_PARAM}, input : C1) -> Unit {
  input(if host_pin_read(${pin}) != 0 { 1.0 } else { 0.0 })
}
`;
  }
}

export class BrowserGpioInBlock extends AbstractGpioInBlock {
  readonly target = "wasm-gc" as const;
}

export class McuGpioInBlock extends AbstractGpioInBlock {
  readonly target = "wasm" as const;
}

/**
 * Abstract GPIO Out block. Writes the pin HIGH when sample > 0.5.
 */
export abstract class AbstractGpioOutBlock extends MoonBlock {
  readonly defId = "gpio_out";
  abstract readonly target?: MoonbitTarget;

  emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    const pin = pinLit(opts);
    return `fn ${name}(${CTX_PARAM}) -> C1 {
  fn(v : Double) { host_pin_write(${pin}, if v > 0.5 { 1 } else { 0 }) }
}
`;
  }
}

export class BrowserGpioOutBlock extends AbstractGpioOutBlock {
  readonly target = "wasm-gc" as const;
}

export class McuGpioOutBlock extends AbstractGpioOutBlock {
  readonly target = "wasm" as const;
}

// Aliases for compatibility
export {
  BrowserGpioInBlock as GpioInMoonBlock,
  AbstractGpioInBlock as AbstractGpioIn,
  BrowserGpioInBlock as BrowserGpioIn,
  McuGpioInBlock as McuGpioIn,
  BrowserGpioOutBlock as GpioOutMoonBlock,
  AbstractGpioOutBlock as AbstractGpioOut,
  BrowserGpioOutBlock as BrowserGpioOut,
  McuGpioOutBlock as McuGpioOut,
};

export const GPIO_IN_BLOCK = new BrowserGpioInBlock();
export const GPIO_OUT_BLOCK = new BrowserGpioOutBlock();

export function emitGpioIn(opts: MoonBlockEmit = {}): string {
  return GPIO_IN_BLOCK.emit(opts);
}

export function emitGpioOut(opts: MoonBlockEmit = {}): string {
  return GPIO_OUT_BLOCK.emit(opts);
}
