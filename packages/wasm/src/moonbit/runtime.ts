import { MEM } from "../runtime/memory";
import { type I32AtomicFn, emitI32Atomics, i32Atomic } from "./atomics";
import { DEV_TARGET, type MoonbitTarget } from "./compile";
import { emitEmbeddedMath } from "./math";

/** Official MoonBit browser bindings (`module.function` → JS `Math.sin`, `Date.now`, …). */
export interface PreambleNeeds {
  sin?: boolean;
  cos?: boolean;
  random?: boolean;
  now?: boolean;
  gpio?: boolean;
  /** MCU hardware timer. GPIO In is edge-driven and does not start one. */
  timer?: boolean;
  /** Atomic wrappers to emit. Defaults to load, which `stopped` uses. */
  atomics?: readonly I32AtomicFn[];
  target?: MoonbitTarget;
}

export const PIN_INPUT = 0;
export const PIN_OUTPUT = 1;
export const PIN_INPUT_PULLUP = 2;

/**
 * Load the stop word through the i32 atomic library.
 * MoonBit inlines unnamed WAT; this is not `memory.atomic.wait32`.
 */
export function emitStopped(target: MoonbitTarget = DEV_TARGET): string {
  if (target === "wasm") {
    return `fn stopped() -> Unit {
  ()
}`;
  }
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
  bindings.push('fn host_tap(v : Double, idx : Int) -> Unit = "host" "tap"');
  if (needs.gpio) {
    bindings.push('fn host_pin_read(pin : Int) -> Int = "host" "pin_read"');
    bindings.push('fn host_pin_write(pin : Int, val : Int) -> Unit = "host" "pin_write"');
    bindings.push('fn host_pin_mode(pin : Int, mode : Int) -> Unit = "host" "pin_mode"');
  }
  return bindings;
}

function envBindings(needs: PreambleNeeds): string {
  const lines = [
    `extern "wasm" fn host_wait_event(timeout_ms : Int) -> Int = "env" "wait_event"`,
  ];
  if (needs.timer !== false) {
    lines.push(`extern "wasm" fn host_timer_start(timer_id : Int, period_us : Int) = "env" "timer_start"`);
  }
  lines.push(`extern "wasm" fn host_usb_write(ptr : Int, len : Int) -> Int = "env" "usb_write"`);
  if (needs.gpio) {
    lines.push(
      `extern "wasm" fn host_pin_mode(pin : Int, mode : Int) = "env" "pin_mode"`,
      `extern "wasm" fn host_pin_write(pin : Int, val : Int) = "env" "pin_write"`,
      `extern "wasm" fn host_pin_read(pin : Int) -> Int = "env" "pin_read"`,
      `extern "wasm" fn host_attach_irq(pin : Int, edge_mode : Int) = "env" "attach_irq"`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function emitTelemetry(needs: PreambleNeeds): string {
  const rngField = needs.random ? "\n  mut rng : Double" : "";
  const rngInit = needs.random ? ", rng: 0.1234567" : "";
  const nowFn = needs.now
    ? `fn now() -> Double {
  mcu.tick_count * 0.001
}

`
    : "";
  return `priv struct McuState {
  mut tick_count : Double${rngField}
}

let mcu : McuState = { tick_count: 0.0${rngInit} }

${nowFn}fn host_push(_v : Double, _ring : Int) -> Unit {
  let _ = host_usb_write(0, 0)
}
`;
}

export function preamble(needs: PreambleNeeds = { sin: true, cos: true, random: true, now: true }): string {
  const target = needs.target ?? DEV_TARGET;
  if (target === "wasm") {
    return preambleProd(needs);
  }
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
    emitStopped(target),
    "///|",
    "type C1 = (Double) -> Unit",
    emitIntrospect("tap"),
    nowFn,
  ];
  return `${parts.filter((part) => part.length > 0).join("\n")}
`;
}

function preambleProd(needs: PreambleNeeds): string {
  const math = emitEmbeddedMath({ sin: needs.sin, cos: needs.cos, random: needs.random });
  const parts = [
    `// XML-matching MoonBit wasm generator for MCU + RTOS (WAMR).
// Host ABI is env (pin_*, wait_event, timer_start, usb_write). No JS Math or setInterval.`,
    envBindings(needs),
    emitTelemetry(needs),
    math,
    emitStopped("wasm"),
    "type C1 = (Double) -> Unit",
    emitIntrospect("identity"),
  ];
  return `${parts.filter((part) => part.length > 0).join("\n")}
`;
}

function emitIntrospect(mode: "tap" | "identity"): string {
  if (mode === "identity") {
    return `fn introspect(_idx : Int, inner : C1) -> C1 {
  inner
}`;
  }
  return `fn introspect(idx : Int, inner : C1) -> C1 {
  fn(v : Double) {
    host_tap(v, idx)
    inner(v)
  }
}`;
}

export function emitStart(): string {
  return `pub fn start(delay_ms : Int) -> Unit {
  let _id = js_set_interval(tick, delay_ms)
}
`;
}

export interface AppMainEmit {
  delayMs: number;
  pins?: readonly { pin: number; mode: number }[];
  /** GPIO In ticks on wait_event type 2 instead of a hardware timer. */
  eventDriven?: boolean;
}

export function emitAppMain(opts: AppMainEmit): string {
  const pinSetup = (opts.pins ?? [])
    .map((item) => `  host_pin_mode(${item.pin}, ${item.mode})`)
    .join("\n");
  const irq = (opts.pins ?? [])
    .filter((item) => item.mode !== PIN_OUTPUT)
    .map((item) => `  host_attach_irq(${item.pin}, 3)`)
    .join("\n");
  const setup = `${pinSetup || "  ()"}
${irq}`;
  if (opts.eventDriven) {
    return `pub fn app_main() -> Unit {
${setup}
  while true {
    let event = host_wait_event(50)
    let event_type = (event >> 16) & 0xFFFF
    if event_type == 2 {
      mcu.tick_count = mcu.tick_count + 1.0
      tick()
    }
  }
}
`;
  }
  const periodUs = Math.max(1, Math.trunc(opts.delayMs)) * 1000;
  return `pub fn app_main() -> Unit {
${setup}
  host_timer_start(0, ${periodUs})
  while true {
    let event = host_wait_event(50)
    let event_type = (event >> 16) & 0xFFFF
    if event_type == 1 {
      mcu.tick_count = mcu.tick_count + 1.0
      tick()
    }
  }
}
`;
}
