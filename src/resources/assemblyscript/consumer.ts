/**
 * AssemblyScript has no closures, so a returned `c<f64>` is a named apply.
 * The inner consumer is specialized into that apply (direct call, no funcref
 * stored in linear memory). Signature still matches XML `c<f64> → c<f64>`.
 */
export function emitReturningConsumer(name: string, applyLine: string): string {
  return `function ${name}(inn: c<f64>): c<f64> {
  return ${name}_apply;
}
function ${name}_apply(v: f64): void {
  ${applyLine}
}
`;
}
