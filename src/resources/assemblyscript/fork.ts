/** Hidden fan-in: XML does not declare fork; SolutionBuilder inserts it when many connectors share an input. */
export const FORK_AS = `/** fork — hidden \`c<f64> → c<f64>\` fan-in. */
function fork(...downstreams: c<f64>[]): c<f64> {
  return v -> { for (c in downstreams) c(v); };
}
`;

export function emitFork(name: string, inners: readonly string[]): string {
  const n = Math.max(inners.length, 2);
  const params = Array.from({ length: n }, (_, i) => `inn${i}: c<f64>`).join(", ");
  const calls = inners.map((inner) => `  ${inner}(v);`).join("\n");
  return `/** fork — hidden \`c<f64>\` fan-in */
function ${name}(${params}): c<f64> {
  return ${name}_apply;
}
function ${name}_apply(v: f64): void {
${calls}
}
`;
}
