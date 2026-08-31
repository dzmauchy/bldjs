/** Hidden fan-in: XML does not declare fork; SolutionBuilder inserts it when many connectors share an input. */
export function emitFork(name: string, inners: readonly string[]): string {
  const body = inners.map((inner) => `  ${inner}(v);`).join("\n");
  return `/** fork — hidden \`c<f64>\` fan-in */
@inline
function ${name}(v: f64): void {
${body}
}
`;
}
