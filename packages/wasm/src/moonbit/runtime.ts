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
  return `fn stopped() -> Unit {
  let _ = ${i32Atomic("load").name}(${MEM.stop})
}`;
}

function jsBindings(needs: PreambleNeeds): string[] {
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
  return bindings;
}

export function preamble(needs: PreambleNeeds = { sin: true, cos: true, random: true, now: true }): string {
  const nowFn = needs.now
    ? `fn now() -> Double {
  date_now() / 1000.0
}`
    : "";
  const parts = [
    `// XML-matching MoonBit wasm-gc generator.
// Browser bindings: Math, Date, js.setInterval. Samples go through host.push.
// i32 atomics are extern "wasm" WAT (not wait). Default is i32.atomic.load for stopped.`,
    jsBindings(needs).join("\n"),
    emitI32Atomics(needs.atomics ?? [i32Atomic("load")]),
    "///|",
    emitStopped(),
    "///|",
    "type C1 = (Double) -> Unit",
    nowFn,
  ];
  return `${parts.filter((part) => part.length > 0).join("\n")}
`;
}

export function emitStart(): string {
  return `pub fn start(delay_ms : Int) -> Unit {
  let _id = js_set_interval(tick, delay_ms)
}
`;
}
