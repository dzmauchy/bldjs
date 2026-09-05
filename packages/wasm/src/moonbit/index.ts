import { emitCos } from "./blocks/cos";
import { emitRandom, emitTimer } from "./blocks/generator";
import { emitScope } from "./blocks/scope";
import { emitSin } from "./blocks/sin";
import type { BlockScript } from "./types";

export type { MoonBlockEmit, BlockScript } from "./types";
export { QUANTIZER_PERIOD_NS } from "./blocks/generator";
export { preamble, emitStart } from "./runtime";
export { emitFork } from "./fork";
export { emitConsumerWrap } from "./consumer";

/** One MoonBit script per runtime block, keyed by XML block id. */
export const BLOCK_SCRIPTS: Record<string, BlockScript> = {
  timer: emitTimer,
  sin: emitSin,
  cos: emitCos,
  random: emitRandom,
  scope: emitScope,
};

export type BlockScriptId = keyof typeof BLOCK_SCRIPTS;
