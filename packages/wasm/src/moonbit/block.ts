import { emitConsumerWrap } from "./consumer";
import type { BlockScript, MoonBlockEmit } from "./types";

/** One MoonBit function matching an XML catalog block. */
export abstract class MoonBlock {
  abstract readonly defId: string;

  abstract emit(opts?: MoonBlockEmit): string;

  script(): BlockScript {
    return (opts) => this.emit(opts);
  }
}

export abstract class MoonGenerator extends MoonBlock {
  protected abstract sampleExpr(): string;

  emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    return `fn ${name}(ctx : Int, input : C1) -> Unit {
  let _ = ctx
  input(${this.sampleExpr()})
}
`;
  }
}

export abstract class MoonTransformer extends MoonBlock {
  protected abstract mapExpr(value: string): string;

  emit(opts: MoonBlockEmit = {}): string {
    return emitConsumerWrap(opts.name ?? this.defId, (value) => this.mapExpr(value));
  }
}

export class TimerMoonBlock extends MoonGenerator {
  readonly defId = "timer";

  protected sampleExpr(): string {
    return "now()";
  }
}

export class RandomMoonBlock extends MoonGenerator {
  readonly defId = "random";

  protected sampleExpr(): string {
    return "math_random()";
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

export class ScopeMoonBlock extends MoonBlock {
  readonly defId = "scope";

  emit(opts: MoonBlockEmit = {}): string {
    const name = opts.name ?? this.defId;
    const length = Math.max(opts.length ?? 1, 1);
    const rings = opts.rings ?? Array.from({ length }, (_, index) => index);
    const plots: string[] = [];
    const names: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const plotName = `${name}_plot_${index}`;
      const ring = rings[index] ?? index;
      names.push(plotName);
      plots.push(`fn ${plotName}(v : Double) -> Unit {
  host_push(v, ${ring})
}
`);
    }
    const resultType = length === 1 ? "C1" : `(${Array.from({ length }, () => "C1").join(", ")})`;
    const resultValue = length === 1 ? names[0] : `(${names.join(", ")})`;
    plots.push(`fn ${name}(ctx : Int) -> ${resultType} {
  let _ = ctx
  ${resultValue}
}
`);
    return plots.join("\n");
  }
}

export const TIMER_BLOCK = new TimerMoonBlock();
export const RANDOM_BLOCK = new RandomMoonBlock();
export const SIN_BLOCK = new SinMoonBlock();
export const COS_BLOCK = new CosMoonBlock();
export const SCOPE_BLOCK = new ScopeMoonBlock();

export const MOON_BLOCKS: readonly MoonBlock[] = [
  TIMER_BLOCK,
  SIN_BLOCK,
  COS_BLOCK,
  RANDOM_BLOCK,
  SCOPE_BLOCK,
];
