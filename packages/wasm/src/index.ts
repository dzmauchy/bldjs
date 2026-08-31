export {
  type CompiledGenerator,
  assembleGenerator,
  compileGenerator,
  generatorText,
  generatorWat,
} from "./compile";
export { canShareMemory, canUseIsolatedWorker } from "./isolation";
export {
  type AssembledModule,
  type AssembleOptions,
  assembleModule,
  assembleWasm,
  assembleWat,
  runtimeTypeWat,
} from "./runtime/assemble";
export {
  DiagramRunCancelled,
  DiagramRunner,
  EMPTY_RUN_MESSAGE,
  RunningDiagram,
  yieldForPaint,
} from "./runtime/diagram-runner";
export {
  type GeneratorHandle,
  instantiateGenerator,
  startGenerator,
  startLocalGenerator,
} from "./runtime/generator";
export {
  CTX,
  MEM,
  SAMPLE_CAP,
  createMemory,
  createSharedMemory,
  readSamples,
} from "./runtime/memory";
export {
  blockSignature,
  blockTypeWat,
  signatureWat,
  wasmHeapTypeName,
  wasmValType,
} from "./runtime/signatures";
export {
  type WasmBuildOptions,
  WasmSolutionBuilder,
  assignRings,
  linearSolutionView,
  preloadAssembler,
} from "./solution/wasm";
// Do not re-export ./binaryen. Those modules statically import the 15MB
// binaryen.js package; loading them from this barrel delays first paint.
// Run and preloadAssembler() dynamic-import that graph instead.
