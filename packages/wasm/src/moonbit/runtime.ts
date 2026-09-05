/** Official MoonBit browser bindings (`module.function` → JS `Math.sin`, `Date.now`, …). */
export function preamble(): string {
  return `// XML-matching MoonBit wasm-gc generator.
// Browser bindings: Math, Date, js.setInterval. Samples go through host.push.
fn math_sin(x : Double) -> Double = "Math" "sin"
fn math_cos(x : Double) -> Double = "Math" "cos"
fn math_random() -> Double = "Math" "random"
fn date_now() -> Double = "Date" "now"
fn js_set_interval(cb : () -> Unit, ms : Int) -> Int = "js" "setInterval"
fn host_push(v : Double, ring : Int) -> Unit = "host" "push"

type C1 = (Double) -> Unit

fn nop(_v : Double) -> Unit {
}

fn now() -> Double {
  date_now() / 1000.0
}
`;
}

export function emitStart(): string {
  return `pub fn start(delay_ms : Int) -> Unit {
  let _id = js_set_interval(tick, delay_ms)
}
`;
}
