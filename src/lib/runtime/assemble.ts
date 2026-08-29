import importsWat from "../../resources/wasm/imports.wat?raw";
import parkWat from "../../resources/wasm/park.wat?raw";
import pushWat from "../../resources/wasm/push.wat?raw";
import stoppedWat from "../../resources/wasm/stopped.wat?raw";
import oscilloscopeWat from "../../resources/wasm/blocks/oscilloscope.wat?raw";
import quantizerWat from "../../resources/wasm/blocks/quantizer.wat?raw";
import sinWat from "../../resources/wasm/blocks/sin.wat?raw";
import timerWat from "../../resources/wasm/blocks/timer.wat?raw";
import { CTX, SAMPLE_CAP } from "./memory";
import { CTX_PARAM, type WasmSignature } from "./signatures";

export type Stage = "sin" | "quantizer";

/** One WAT function per runtime block, keyed by XML block id. */
export const BLOCK_WAT: Record<string, string> = {
  timer: timerWat,
  quantizer: quantizerWat,
  sin: sinWat,
  oscilloscope: oscilloscopeWat,
};

export const RUNTIME_WAT = {
  imports: importsWat,
  push: pushWat,
  park: parkWat,
  stopped: stoppedWat,
} as const;

export interface AssembleOptions {
  stages: readonly Stage[];
  delayMs: number;
}

function indent(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => (line.length ? `  ${line}` : line))
    .join("\n");
}

function typeDecl(id: string, params: { name: string; type: string }[], results: { name: string; type: string }[]): string {
  const inner = [
    ...params.map((port) => `(param $${port.name} ${port.type})`),
    ...results.map((port) => `(result $${port.name} ${port.type})`),
  ].join(" ");
  return `  (type $${id} (func${inner ? ` ${inner}` : ""}))`;
}

/** Types whose names are referenced from block WAT (`$fn_timer`, …). */
export function runtimeTypeWat(): string {
  return [
    typeDecl("fn_now", [], [{ name: "out", type: "f64" }]),
    typeDecl("fn_host_sin", [{ name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_push", [{ name: "v", type: "f64" }], []),
    typeDecl("fn_park", [{ name: "ns", type: "i64" }], []),
    typeDecl("fn_stopped", [], [{ name: "flag", type: "i32" }]),
    typeDecl("fn_void", [], []),
    typeDecl("fn_timer", [CTX_PARAM], [{ name: "out", type: "f64" }]),
    typeDecl("fn_quantizer", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_sin", [CTX_PARAM, { name: "in", type: "f64" }], [{ name: "out", type: "f64" }]),
    typeDecl("fn_oscilloscope", [CTX_PARAM, { name: "in", type: "f64" }], []),
  ].join("\n");
}

export function blockTypeWat(sig: WasmSignature): string {
  return typeDecl(`fn_${sig.id}`, [CTX_PARAM, ...sig.params], sig.results);
}

function composeTick(stages: readonly Stage[]): string {
  let expr = `(call_ref $fn_timer (local.get $ctx) (ref.func $timer))`;
  for (const stage of stages) {
    expr = `(call_ref $fn_${stage} (local.get $ctx) ${expr} (ref.func $${stage}))`;
  }
  return `(call_ref $fn_oscilloscope (local.get $ctx) ${expr} (ref.func $oscilloscope))`;
}

function tickWat(stages: readonly Stage[], delayNs: bigint): string {
  return `  (func $tick (export "tick") (type $fn_void)
    (local $ctx i32)
    (local.set $ctx (i32.const ${CTX}))
    (f64.store (local.get $ctx) (call $now))
    (i64.store offset=8 (local.get $ctx) (i64.const ${delayNs}))
    ${composeTick(stages)})`;
}

function runWat(delayNs: bigint): string {
  return `  (func $run (export "run") (type $fn_void)
    (loop $again
      (call $tick)
      (call $park (i64.const ${delayNs}))
      (br_if $again (i32.eqz (call $stopped)))))`;
}

/**
 * Assemble catalog block WAT files, runtime helpers, and a tick/run composition
 * into one module. The app compiles this text when the simulation starts.
 */
export function assembleWat(options: AssembleOptions): string {
  if (!pushWat.includes(`i32.const ${SAMPLE_CAP}`)) {
    throw new Error(`push.wat must use SAMPLE_CAP=${SAMPLE_CAP}`);
  }
  const delayNs = BigInt(Math.max(options.delayMs, 1)) * 1_000_000n;
  const blocks = Object.values(BLOCK_WAT).map(indent).join("\n\n");
  return `(module
${runtimeTypeWat()}
${indent(importsWat)}
${indent(pushWat)}
${indent(parkWat)}
${indent(stoppedWat)}

${blocks}

  (elem declare func $timer $quantizer $sin $oscilloscope)

${tickWat(options.stages, delayNs)}

${runWat(delayNs)}
)
`;
}
