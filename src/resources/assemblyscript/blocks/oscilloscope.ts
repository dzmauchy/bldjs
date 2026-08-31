/** Catalog shape: XML `() → c<f64>[]`. */
export const OSCILLOSCOPE_AS = `/** oscilloscope — XML \`() → c<f64>[]\`. A plot sink writes one sample ring. */
@inline
function oscilloscope(v: f64): void {
  push_at(v, 0);
}
`;

export function emitOscilloscope(name: string, length: number, rings: readonly number[]): string {
  const n = Math.max(length, 1);
  const parts: string[] = [
    `/** oscilloscope — XML \`() → c<f64>[]\` (${n} plot ${n === 1 ? "sink" : "sinks"}) */`,
  ];
  for (let slot = 0; slot < n; slot += 1) {
    const plot = n === 1 ? name : `${name}_${slot}`;
    const ring = rings[slot] ?? slot;
    parts.push(`@inline
function ${plot}(v: f64): void {
  push_at(v, ${ring});
}
`);
  }
  return parts.join("\n");
}

export function oscilloscopeSlotName(instance: string, slot: number, length: number): string {
  return length === 1 ? instance : `${instance}_${slot}`;
}
