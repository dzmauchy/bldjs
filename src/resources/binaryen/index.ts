import { addCos } from "./blocks/cos";
import { addOscilloscope } from "./blocks/oscilloscope";
import { addQuantizer } from "./blocks/quantizer";
import { addSin } from "./blocks/sin";
import { addTimer } from "./blocks/timer";
import { addImports } from "./imports";
import { addPush } from "./push";
import { addStopped } from "./stopped";
import { addTap } from "./tap";
import type { WasmBlockEmit } from "./consumer";
import type { WasmCatalogTypes } from "./gc-types";
import type binaryen from "binaryen";

export type { WasmBlockEmit } from "./consumer";
export type { WasmCatalogTypes } from "./gc-types";
export { addCatalogTypes, GC_FEATURES, nopConsumer } from "./gc-types";
export { addFork } from "./fork";
export { addTap } from "./tap";

type BlockScript = (module: binaryen.Module, types: WasmCatalogTypes, opts?: WasmBlockEmit) => number;

/** One binaryen.js script per runtime block, keyed by XML block id. */
export const BLOCK_SCRIPTS: Record<string, BlockScript> = {
  timer: addTimer,
  quantizer: addQuantizer,
  sin: addSin,
  cos: addCos,
  oscilloscope: addOscilloscope,
};

export const RUNTIME_SCRIPTS = {
  imports: addImports,
  push: addPush,
  stopped: addStopped,
} as const;

export type BlockScriptId = keyof typeof BLOCK_SCRIPTS;
