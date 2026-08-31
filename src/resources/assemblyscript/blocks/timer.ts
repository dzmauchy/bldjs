/** Catalog shape: XML `c<f64> → void`. */
export const TIMER_AS = `/** timer — XML \`c<f64> → void\`. Pushes \`CTX.time\` into \`inn\`. */
@inline
function timer(inn: c<f64>): void {
  inn(load<f64>(CTX));
}
`;

/** Specialized instance: call the wired consumer with the current time. */
export function emitTimer(name: string, inner: string): string {
  return `/** timer — XML \`c<f64> → void\` */
@inline
function ${name}(): void {
  ${inner}(load<f64>(CTX));
}
`;
}
