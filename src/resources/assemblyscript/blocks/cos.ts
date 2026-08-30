/** Catalog shape: XML `c<f64> → c<f64>`. */
export const COS_AS = `/** cos — XML \`c<f64> → c<f64>\`. Maps then forwards. */
@inline
function cos(inn: c<f64>, v: f64): void {
  inn(host_cos(v));
}
`;

export function emitCos(name: string, inner: string): string {
  return `/** cos — XML \`c<f64> → c<f64>\` */
@inline
function ${name}(v: f64): void {
  ${inner}(host_cos(v));
}
`;
}
