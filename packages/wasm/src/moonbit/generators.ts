import { DEFAULT_PERIOD_MS } from "@bld/xml/blocks/cs/ids";
import { MoonBlock } from "./block";
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

export class TimerMoonBlock extends MoonGenerator {
  readonly defId = "timer";

  protected sampleExpr(): string {
    return "now()";
  }
}

export class RandomMoonBlock extends MoonGenerator {
  readonly defId = "random";

  protected sampleExpr(): string {
    return "math_random()";
  }
}

export const TIMER_BLOCK = new TimerMoonBlock();
export const RANDOM_BLOCK = new RandomMoonBlock();

export function emitTimer(opts: MoonBlockEmit = {}): string {
  return TIMER_BLOCK.emit(opts);
}

export function emitRandom(opts: MoonBlockEmit = {}): string {
  return RANDOM_BLOCK.emit(opts);
}
