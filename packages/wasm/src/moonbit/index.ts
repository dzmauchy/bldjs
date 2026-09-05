import { COS_BLOCK, MOON_BLOCKS, RANDOM_BLOCK, SCOPE_BLOCK, SIN_BLOCK, TIMER_BLOCK } from "./block";
import type { BlockScript } from "./types";

export type { MoonBlockEmit, BlockScript } from "./types";
export { QUANTIZER_PERIOD_NS } from "./blocks/generator";
export { preamble, emitStart, emitStopped } from "./runtime";
export { emitFork } from "./fork";
export { emitConsumerWrap } from "./consumer";
export {
  CosMoonBlock,
  MoonBlock,
  MoonGenerator,
  MoonTransformer,
  RandomMoonBlock,
  ScopeMoonBlock,
  SinMoonBlock,
  TimerMoonBlock,
} from "./block";

/** One MoonBit script per runtime block, keyed by XML block id. */
export const BLOCK_SCRIPTS: Record<string, BlockScript> = Object.fromEntries(
  MOON_BLOCKS.map((block) => [block.defId, block.script()]),
);

export const emitTimer = TIMER_BLOCK.script();
export const emitRandom = RANDOM_BLOCK.script();
export const emitSin = SIN_BLOCK.script();
export const emitCos = COS_BLOCK.script();
export const emitScope = SCOPE_BLOCK.script();

export type BlockScriptId = keyof typeof BLOCK_SCRIPTS;
