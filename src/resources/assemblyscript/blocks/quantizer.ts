/** Catalog shape: XML `c<f64> → c<f64>`. */
export const QUANTIZER_AS = `/** quantizer — XML \`c<f64> → c<f64>\`. Delay is applied by the generator \`setInterval\`. */
@inline
function quantizer(inn: c<f64>, v: f64): void {
  inn(v);
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
