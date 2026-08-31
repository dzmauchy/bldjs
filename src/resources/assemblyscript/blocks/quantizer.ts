/** Catalog shape: XML `c<f64> → c<f64>`. */
export const QUANTIZER_AS = `/** quantizer — XML \`c<f64> → c<f64>\`. */
function quantizer(period: i32, in: c<f64>): c<f64> {
  return v -> {
    in(v);
    return atomic.wait<i32>(WAIT, 0, i64(period) * 1_000_000);
  };
}
`;

export function emitQuantizer(name: string, inner: string): string {
  return `/** quantizer — XML \`c<f64> → c<f64>\` */
@inline
function ${name}(v: f64): void {
  ${inner}(v);
}
`;
}
