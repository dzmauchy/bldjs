import { omegaFrom, zetaFrom } from "@bld/xml/blocks/cs/ids";
import { MoonBlock } from "./block";
import { CTX_PARAM, type MoonBlockEmit } from "./types";

function moonDouble(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function moonIdent(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * XML `(Double) -> Unit → (Double) -> Unit` wrapper: capture `input` and return a `C1` that maps then forwards.
 * Extra runtime param `_ctx` is not an XML port.
 */
export function emitConsumerWrap(name: string, mapExpr: (value: string) => string): string {
  return `fn ${name}(${CTX_PARAM}, input : C1) -> C1 {
  fn(v : Double) { input(${mapExpr("v")}) }
}
`;
}

export abstract class MoonTransformer extends MoonBlock {
  protected abstract mapExpr(value: string): string;

  emit(opts: MoonBlockEmit = {}): string {
    return emitConsumerWrap(opts.name ?? this.defId, (value) => this.mapExpr(value));
  }
}

export class SinMoonBlock extends MoonTransformer {
  readonly defId = "sin";

  protected mapExpr(value: string): string {
    return `math_sin(${value})`;
  }
}

export class CosMoonBlock extends MoonTransformer {
  readonly defId = "cos";

  protected mapExpr(value: string): string {
    return `math_cos(${value})`;
  }
}

/**
 * Second-order underdamped unit-step. Time is the input relative to the first sample.
 * `ζ` and `ω` are baked from catalog parameters; `ωd = ω√(1−ζ²)` and sin/cos/exp/sqrt run at sample time.
 */
export function emitOvershootWrap(
  name: string,
  zeta?: number,
  omega?: number,
  timeInput: boolean = true,
): string {
  const z = zetaFrom(zeta);
  const w = omegaFrom(omega);
  const ident = moonIdent(name);
  if (timeInput) {
    return `priv struct OvershootClock_${ident} {
  mut t0 : Double
  mut on : Int
}

let clock_${ident} : OvershootClock_${ident} = { t0: 0.0, on: 0 }

fn ${name}(${CTX_PARAM}, input : C1) -> C1 {
  fn(v : Double) {
    if clock_${ident}.on == 0 {
      clock_${ident}.t0 = v
      clock_${ident}.on = 1
    }
    let t = v - clock_${ident}.t0
    let zeta = ${moonDouble(z)}
    let w = ${moonDouble(w)}
    let wd = w * math_sqrt(1.0 - zeta * zeta)
    let sigma = zeta * w
    let decay = math_exp(0.0 - sigma * t)
    let phase = wd * t
    let y = 1.0 - decay * (math_cos(phase) + sigma / wd * math_sin(phase))
    input(if t < 0.0 { 0.0 } else { y })
  }
}
`;
  }

  return `priv struct OvershootState_${ident} {
  mut initialized : Int
  mut t_step : Double
  mut base_y : Double
  mut target_u : Double
  mut current_y : Double
}

let state_${ident} : OvershootState_${ident} = {
  initialized: 0,
  t_step: 0.0,
  base_y: 0.0,
  target_u: 0.0,
  current_y: 0.0,
}

fn ${name}(${CTX_PARAM}, input : C1) -> C1 {
  fn(v : Double) {
    let cur_t = now()
    if state_${ident}.initialized == 0 {
      state_${ident}.initialized = 1
      state_${ident}.t_step = cur_t
      state_${ident}.base_y = v
      state_${ident}.target_u = v
      state_${ident}.current_y = v
      input(v)
    } else {
      let diff = v - state_${ident}.target_u
      let abs_diff = if diff < 0.0 { 0.0 - diff } else { diff }
      if abs_diff > 0.000001 {
        state_${ident}.t_step = cur_t
        state_${ident}.base_y = state_${ident}.current_y
        state_${ident}.target_u = v
      }
      let tau = cur_t - state_${ident}.t_step
      let t = if tau < 0.0 { 0.0 } else { tau }
      let zeta = ${moonDouble(z)}
      let w = ${moonDouble(w)}
      let wd = w * math_sqrt(1.0 - zeta * zeta)
      let sigma = zeta * w
      let decay = math_exp(0.0 - sigma * t)
      let phase = wd * t
      let factor = 1.0 - decay * (math_cos(phase) + sigma / wd * math_sin(phase))
      let y = state_${ident}.base_y + (state_${ident}.target_u - state_${ident}.base_y) * factor
      state_${ident}.current_y = y
      input(y)
    }
  }
}
`;
}

export class OvershootMoonBlock extends MoonBlock {
  readonly defId = "overshoot";

  emit(opts: MoonBlockEmit = {}): string {
    return emitOvershootWrap(opts.name ?? this.defId, opts.zeta, opts.omega, opts.timeInput ?? true);
  }
}

export const SIN_BLOCK = new SinMoonBlock();
export const COS_BLOCK = new CosMoonBlock();
export const OVERSHOOT_BLOCK = new OvershootMoonBlock();

export function emitSin(opts: MoonBlockEmit = {}): string {
  return SIN_BLOCK.emit(opts);
}

export function emitCos(opts: MoonBlockEmit = {}): string {
  return COS_BLOCK.emit(opts);
}

export function emitOvershoot(opts: MoonBlockEmit = {}): string {
  return OVERSHOOT_BLOCK.emit(opts);
}
