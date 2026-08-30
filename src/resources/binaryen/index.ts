import { addCos } from "./blocks/cos";
import { addOscilloscope } from "./blocks/oscilloscope";
import { addQuantizer } from "./blocks/quantizer";
import { addSin } from "./blocks/sin";
import { addTimer } from "./blocks/timer";
import { addImports } from "./imports";
import { addPark } from "./park";
import { addPush } from "./push";
import { addStopped } from "./stopped";

/** One binaryen.js script per runtime block, keyed by XML block id. */
export const BLOCK_SCRIPTS = {
  timer: addTimer,
  quantizer: addQuantizer,
  sin: addSin,
  cos: addCos,
  oscilloscope: addOscilloscope,
} as const;

export const RUNTIME_SCRIPTS = {
  imports: addImports,
  push: addPush,
  park: addPark,
  stopped: addStopped,
} as const;

export type BlockScriptId = keyof typeof BLOCK_SCRIPTS;
