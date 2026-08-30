/** Catalog shape: XML `c<f64> → c<f64>`. */
export const SIN_AS = `/** sin — XML \`c<f64> → c<f64>\`. Maps then forwards. */
@inline
function sin(inn: c<f64>, v: f64): void {
  inn(host_sin(v));
}
`;

export function emitSin(name: string, inner: string): string {
  return `/** sin — XML \`c<f64> → c<f64>\` */
@inline
function ${name}(v: f64): void {
  ${inner}(host_sin(v));
}
`;
}
