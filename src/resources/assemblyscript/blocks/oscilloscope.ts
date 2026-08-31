/** Catalog shape: XML `() → c<f64>[]`. */
export const OSCILLOSCOPE_AS = `/** oscilloscope — XML \`() → c<f64>[]\`. A plot sink writes one sample ring. */
function plot(v: f64): void {
  push_at(v, 0);
}
function oscilloscope(): c<f64>[] {
  return [plot];
}
`;

export function emitOscilloscope(name: string, length: number, rings: readonly number[]): string {
  const n = Math.max(length, 1);
  const plots: string[] = [];
  const parts: string[] = [
    `/** oscilloscope — XML \`() → c<f64>[]\` (${n} plot ${n === 1 ? "sink" : "sinks"}) */`,
  ];
  for (let slot = 0; slot < n; slot += 1) {
    const plot = `${name}_${slot}`;
    const ring = rings[slot] ?? slot;
    plots.push(plot);
    parts.push(`function ${plot}(v: f64): void {
  push_at(v, ${ring});
}
`);
  }
  parts.push(`function ${name}(): c<f64>[] {
  return [${plots.join(", ")}];
}
`);
  return parts.join("\n");
}

export function oscilloscopeSlotName(instance: string, slot: number, _length = 1): string {
  return `${instance}_${slot}`;
}
