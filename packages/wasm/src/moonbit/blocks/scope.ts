import type { MoonBlockEmit } from "../types";

/**
 * scope — XML `() → c<f64>[]`. Extra `ctx : Int`.
 * Returns plot sinks; `length` is the number of outgoing connectors.
 */
export function emitScope(opts: MoonBlockEmit = {}): string {
  const name = opts.name ?? "scope";
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
