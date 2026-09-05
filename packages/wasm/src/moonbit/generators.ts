import { DEFAULT_PERIOD_MS, DEFAULT_VALUE, valueFrom } from "@bld/xml/blocks/cs/ids";
import { MoonBlock } from "./block";
import type { MoonbitTarget } from "./compile";
import { CTX_PARAM, type MoonBlockEmit } from "./types";

/** Default generator quantization period in nanoseconds (`DEFAULT_PERIOD_MS`). */
export const QUANTIZER_PERIOD_NS = DEFAULT_PERIOD_MS * 1_000_000;

/**
 * Shared generator: sample once and push into `input`.
 * The imported browser `setInterval` spaces ticks; there is no atomic wait.
 */
export abstract class MoonGenerator extends MoonBlock {
  protected abstract sampleExpr(): string;

  emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    return `fn ${name}(${CTX_PARAM}, input : C1) -> Unit {
  input(${this.sampleExpr()})
}
`;
  }
}

export abstract class AbstractTimerBlock extends MoonGenerator {
  readonly defId = "timer";
  abstract readonly target?: MoonbitTarget;
}

export class BrowserTimerBlock extends AbstractTimerBlock {
  readonly target = "wasm-gc" as const;

  protected sampleExpr(): string {
    return "now()";
  }
}

export class McuTimerBlock extends AbstractTimerBlock {
  readonly target = "wasm" as const;

  protected sampleExpr(): string {
    return "now()";
  }
}

export abstract class AbstractRandomBlock extends MoonGenerator {
  readonly defId = "random";
  abstract readonly target?: MoonbitTarget;
}

export class BrowserRandomBlock extends AbstractRandomBlock {
  readonly target = "wasm-gc" as const;

  protected sampleExpr(): string {
    return "math_random()";
  }
}

export class McuRandomBlock extends AbstractRandomBlock {
  readonly target = "wasm" as const;

  protected sampleExpr(): string {
    return "math_random()";
  }
}

function moonDouble(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

export abstract class AbstractConstantBlock extends MoonGenerator {
  readonly defId = "constant";
  abstract readonly target?: MoonbitTarget;

  protected sampleExpr(): string {
    return "1.0";
  }

  override emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    const value = valueFrom(opts.value ?? DEFAULT_VALUE);
    return `fn ${name}(${CTX_PARAM}, input : C1) -> Unit {
  input(${moonDouble(value)})
}
`;
  }
}

export class BrowserConstantBlock extends AbstractConstantBlock {
  readonly target = "wasm-gc" as const;
}

export class McuConstantBlock extends AbstractConstantBlock {
  readonly target = "wasm" as const;
}

// Aliases for compatibility
export {
  BrowserTimerBlock as TimerMoonBlock,
  AbstractTimerBlock as AbstractTimer,
  BrowserTimerBlock as BrowserTimer,
  McuTimerBlock as McuTimer,
  BrowserRandomBlock as RandomMoonBlock,
  AbstractRandomBlock as AbstractRandom,
  BrowserRandomBlock as BrowserRandom,
  McuRandomBlock as McuRandom,
  BrowserConstantBlock as ConstantMoonBlock,
  AbstractConstantBlock as AbstractConstant,
  BrowserConstantBlock as BrowserConstant,
  McuConstantBlock as McuConstant,
};

export const TIMER_BLOCK = new BrowserTimerBlock();
export const RANDOM_BLOCK = new BrowserRandomBlock();
export const CONSTANT_BLOCK = new BrowserConstantBlock();

export function emitTimer(opts: MoonBlockEmit = {}): string {
  return TIMER_BLOCK.emit(opts);
}

export function emitRandom(opts: MoonBlockEmit = {}): string {
  return RANDOM_BLOCK.emit(opts);
}

export function emitConstant(opts: MoonBlockEmit = {}): string {
  return CONSTANT_BLOCK.emit(opts);
}
