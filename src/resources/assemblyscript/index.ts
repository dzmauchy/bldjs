import { emitCos, COS_AS } from "./blocks/cos";
import { emitOscilloscope, OSCILLOSCOPE_AS, oscilloscopeSlotName } from "./blocks/oscilloscope";
import { emitQuantizer, QUANTIZER_AS } from "./blocks/quantizer";
import { emitSin, SIN_AS } from "./blocks/sin";
import { emitTimer, TIMER_AS } from "./blocks/timer";
import { runtimeAs } from "./runtime";
import { TYPE_ALIASES_AS } from "./types";

export { TYPE_ALIASES_AS } from "./types";
export { runtimeAs, compileOptions } from "./runtime";
export { emitFork } from "./fork";

/** One AssemblyScript function per runtime block, keyed by XML block id. */
export const BLOCK_AS: Record<string, string> = {
  timer: TIMER_AS,
  quantizer: QUANTIZER_AS,
  sin: SIN_AS,
  cos: COS_AS,
  oscilloscope: OSCILLOSCOPE_AS,
};

export type BlockScriptId = keyof typeof BLOCK_AS;

export interface BlockEmitOpts {
  name: string;
  inner?: string;
  length?: number;
  rings?: readonly number[];
}

export function emitBlockInstance(id: string, opts: BlockEmitOpts): string {
  const inner = opts.inner ?? "nop";
  switch (id) {
    case "timer":
      return emitTimer(opts.name, inner);
    case "sin":
      return emitSin(opts.name, inner);
    case "cos":
      return emitCos(opts.name, inner);
    case "quantizer":
      return emitQuantizer(opts.name, inner);
    case "oscilloscope":
      return emitOscilloscope(opts.name, opts.length ?? 1, opts.rings ?? [0]);
    default:
      return "";
  }
}

export function preambleAs(): string {
  return `${TYPE_ALIASES_AS}\n${runtimeAs()}`;
}

export { emitOscilloscope, oscilloscopeSlotName };
