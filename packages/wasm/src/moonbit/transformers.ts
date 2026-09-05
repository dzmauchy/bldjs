import { wdFrom, zetaFrom } from "@bld/xml/blocks/cs/ids";
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
 * `ζ` and `ωd` are baked from catalog parameters; sin/cos/exp/sqrt run at sample time.
 */
export function emitOvershootWrap(name: string, zeta?: number, wd?: number): string {
  const z = zetaFrom(zeta);
  const damped = wdFrom(wd);
  const ident = moonIdent(name);
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
    let wd = ${moonDouble(damped)}
    let sigma = zeta * wd / math_sqrt(1.0 - zeta * zeta)
    let decay = math_exp(0.0 - sigma * t)
    let omega = wd * t
    let y = 1.0 - decay * (math_cos(omega) + sigma / wd * math_sin(omega))
    input(if t < 0.0 { 0.0 } else { y })
  }
}
`;
}

export class OvershootMoonBlock extends MoonBlock {
  readonly defId = "overshoot";

  emit(opts: MoonBlockEmit = {}): string {
    return emitOvershootWrap(opts.name ?? this.defId, opts.zeta, opts.wd);
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
