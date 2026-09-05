import { MoonBlock } from "./block";
import { RANDOM_BLOCK, TIMER_BLOCK } from "./generators";
import { GPIO_IN_BLOCK, GPIO_OUT_BLOCK } from "./gpio";
import { SCOPE_BLOCK } from "./scope";
import { COS_BLOCK, SIN_BLOCK } from "./transformers";
import type { BlockScript } from "./types";

export const MOON_BLOCKS: readonly MoonBlock[] = [
  TIMER_BLOCK,
  SIN_BLOCK,
  COS_BLOCK,
  RANDOM_BLOCK,
  SCOPE_BLOCK,
  GPIO_IN_BLOCK,
  GPIO_OUT_BLOCK,
];

/** One MoonBit script per runtime block, keyed by XML block id. */
export const BLOCK_SCRIPTS: Record<string, BlockScript> = Object.fromEntries(
  MOON_BLOCKS.map((block) => [block.defId, block.script()]),
);

export type BlockScriptId = keyof typeof BLOCK_SCRIPTS;
