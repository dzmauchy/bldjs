/** Catalog shape: XML `c<f64> → void`. */
export const TIMER_AS = `/** timer — XML \`c<f64> → void\`. Pushes \`CTX.time\` into \`inn\`. */
function timer(inn: c<f64>): void {
  inn(load<f64>(CTX));
}
`;

/** Instance: XML signature, inner consumer specialized as a direct call. */
export function emitTimer(name: string, inner: string): string {
  return `/** timer — XML \`c<f64> → void\` */
function ${name}(inn: c<f64>): void {
  ${inner}(load<f64>(CTX));
}
`;
}
