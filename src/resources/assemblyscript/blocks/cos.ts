import { emitReturningConsumer } from "../consumer";

/** Catalog shape: XML `c<f64> → c<f64>`. */
export const COS_AS = `/** cos — XML \`c<f64> → c<f64>\`. Maps then forwards. */
function cos(inn: c<f64>): c<f64> {
  return v -> inn(host_cos(v));
}
`;

export function emitCos(name: string, inner: string): string {
  return `/** cos — XML \`c<f64> → c<f64>\` */
${emitReturningConsumer(name, `${inner}(host_cos(v));`)}`;
}
