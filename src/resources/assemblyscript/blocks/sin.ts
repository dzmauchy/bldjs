import { emitReturningConsumer } from "../consumer";

/** Catalog shape: XML `c<f64> → c<f64>`. */
export const SIN_AS = `/** sin — XML \`c<f64> → c<f64>\`. Maps then forwards. */
function sin(inn: c<f64>): c<f64> {
  return v -> inn(host_sin(v));
}
`;

export function emitSin(name: string, inner: string): string {
  return `/** sin — XML \`c<f64> → c<f64>\` */
${emitReturningConsumer(name, `${inner}(host_sin(v));`)}`;
}
