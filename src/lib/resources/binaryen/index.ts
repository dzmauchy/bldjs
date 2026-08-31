import { addCos } from "./blocks/cos";
import { addScope } from "./blocks/scope";
import { addQuantizer } from "./blocks/quantizer";
import { addSin } from "./blocks/sin";
import { addTimer } from "./blocks/timer";
import { addFailTag } from "./exceptions";
import { addImports } from "./imports";
import { addPush } from "./push";
import { addStopped } from "./stopped";
import { addNotify, addWait } from "./wait";
import type { WasmBlockEmit } from "./consumer";
import type { WasmCatalogTypes } from "./gc-types";
import type binaryen from "binaryen";

export type { WasmBlockEmit } from "./consumer";
export type { WasmCatalogTypes } from "./gc-types";
export { addCatalogTypes, nopConsumer } from "./gc-types";
export { wasmFeatures, GC_FEATURES } from "./features";
export { addFork } from "./fork";
export { addJsStringBuiltins, JS_STRING_MODULE } from "./strings";
export { addFailTag, FAIL_TAG } from "./exceptions";
export { addWait, addNotify } from "./wait";
export { QUANTIZER_PERIOD_NS } from "./blocks/quantizer";

type BlockScript = (module: binaryen.Module, types: WasmCatalogTypes, opts?: WasmBlockEmit) => number;

/** One binaryen.js script per runtime block, keyed by XML block id. */
export const BLOCK_SCRIPTS: Record<string, BlockScript> = {
  timer: addTimer,
  quantizer: addQuantizer,
  sin: addSin,
  cos: addCos,
  scope: addScope,
};

export const RUNTIME_SCRIPTS = {
  imports: addImports,
  push: addPush,
  stopped: addStopped,
  wait: addWait,
  notify: addNotify,
  failTag: addFailTag,
} as const;

export type BlockScriptId = keyof typeof BLOCK_SCRIPTS;
