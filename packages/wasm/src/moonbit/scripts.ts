import { MoonBlock } from "./block";
import {
  BrowserConstantBlock,
  BrowserRandomBlock,
  BrowserTimerBlock,
  McuConstantBlock,
  McuRandomBlock,
  McuTimerBlock,
} from "./generators";
import {
  BrowserGpioInBlock,
  BrowserGpioOutBlock,
  McuGpioInBlock,
  McuGpioOutBlock,
} from "./gpio";
import { BrowserProductBlock, McuProductBlock } from "./combiners";
import { BrowserScopeBlock, McuScopeBlock } from "./scope";
import {
  BrowserCosBlock,
  BrowserOvershootBlock,
  BrowserSinBlock,
  McuCosBlock,
  McuOvershootBlock,
  McuSinBlock,
} from "./transformers";
import type { BlockScript } from "./types";

export const BROWSER_MOON_BLOCKS: readonly MoonBlock[] = [
  new BrowserTimerBlock(),
  new BrowserConstantBlock(),
  new BrowserSinBlock(),
  new BrowserCosBlock(),
  new BrowserOvershootBlock(),
  new BrowserProductBlock(),
  new BrowserRandomBlock(),
  new BrowserScopeBlock(),
  new BrowserGpioInBlock(),
  new BrowserGpioOutBlock(),
];

export const MCU_MOON_BLOCKS: readonly MoonBlock[] = [
  new McuTimerBlock(),
  new McuConstantBlock(),
  new McuSinBlock(),
  new McuCosBlock(),
  new McuOvershootBlock(),
  new McuProductBlock(),
  new McuRandomBlock(),
  new McuScopeBlock(),
  new McuGpioInBlock(),
  new McuGpioOutBlock(),
];

export const BROWSER_BLOCKS: Record<string, MoonBlock> = Object.fromEntries(
  BROWSER_MOON_BLOCKS.map((block) => [block.defId, block]),
);

export const MCU_BLOCKS: Record<string, MoonBlock> = Object.fromEntries(
  MCU_MOON_BLOCKS.map((block) => [block.defId, block]),
);

export const MOON_BLOCKS: readonly MoonBlock[] = BROWSER_MOON_BLOCKS;

/** One MoonBit script per runtime block, keyed by XML block id. */
export const BLOCK_SCRIPTS: Record<string, BlockScript> = Object.fromEntries(
  MOON_BLOCKS.map((block) => [block.defId, block.script()]),
);

export type BlockScriptId = keyof typeof BLOCK_SCRIPTS;
