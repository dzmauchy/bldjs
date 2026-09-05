import { MEM } from "../runtime/memory";
import { type I32AtomicFn, emitI32Atomics, i32Atomic } from "./atomics";

/** Official MoonBit browser bindings (`module.function` → JS `Math.sin`, `Date.now`, …). */
export interface PreambleNeeds {
  sin?: boolean;
  cos?: boolean;
  random?: boolean;
  now?: boolean;
  /** Atomic wrappers to emit. Defaults to load, which `stopped` uses. */
  atomics?: readonly I32AtomicFn[];
}

/**
 * Load the stop word through the i32 atomic library.
 * MoonBit inlines unnamed WAT; this is not `memory.atomic.wait32`.
 */
export function emitStopped(): string {
  return `fn stopped() -> Int {
  ${i32Atomic("load").name}(${MEM.stop})
}`;
}

export function preamble(needs: PreambleNeeds = { sin: true, cos: true, random: true, now: true }): string {
  const bindings: string[] = [];
  if (needs.sin) {
    bindings.push('fn math_sin(x : Double) -> Double = "Math" "sin"');
  }
  if (needs.cos) {
    bindings.push('fn math_cos(x : Double) -> Double = "Math" "cos"');
  }
  if (needs.random) {
    bindings.push('fn math_random() -> Double = "Math" "random"');
  }
  if (needs.now) {
    bindings.push('fn date_now() -> Double = "Date" "now"');
  }
  bindings.push('fn js_set_interval(cb : () -> Unit, ms : Int) -> Int = "js" "setInterval"');
  bindings.push('fn host_push(v : Double, ring : Int) -> Unit = "host" "push"');
  bindings.push(emitI32Atomics(needs.atomics ?? [i32Atomic("load")]));
  bindings.push(emitStopped());
  const nowFn = needs.now
    ? `
fn now() -> Double {
  date_now() / 1000.0
}
`
    : "";
  return `// XML-matching MoonBit wasm-gc generator.
// Browser bindings: Math, Date, js.setInterval. Samples go through host.push.
// i32 atomics are extern "wasm" WAT (not wait). Default is i32.atomic.load for stopped.
${bindings.join("\n")}

type C1 = (Double) -> Unit
${nowFn}`;
}

export function emitStart(): string {
  return `pub fn start(delay_ms : Int) -> Unit {
  let _id = js_set_interval(tick, delay_ms)
}
`;
}
