import { emitReturningConsumer } from "../consumer";

/** Catalog shape: XML `c<f64> → c<f64>`. */
export const QUANTIZER_AS = `/** quantizer — XML \`c<f64> → c<f64>\`. */
function quantizer(inn: c<f64>): c<f64> {
  return v -> {
    inn(v);
    return atomic.wait<i32>(WAIT, 0, load<i64>(CTX + 8));
  };
}
`;

export function emitQuantizer(name: string, inner: string): string {
  return `/** quantizer — XML \`c<f64> → c<f64>\` */
${emitReturningConsumer(name, `${inner}(v);`)}`;
}
