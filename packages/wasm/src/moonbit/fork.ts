/** Hidden fan-in: XML does not declare fork; SolutionBuilder inserts it when many connectors share an input. */
export function emitFork(name: string, arity: number): string {
  const count = Math.max(arity, 1);
  const params = Array.from({ length: count }, (_, index) => `in${index} : C1`).join(", ");
  const forwards = Array.from({ length: count }, (_, index) => `    in${index}(v)`).join("\n");
  return `fn ${name}(ctx : Int, ${params}) -> C1 {
  let _ = ctx
  fn(v : Double) {
${forwards}
  }
}
`;
}
