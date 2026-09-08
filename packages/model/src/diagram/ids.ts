export function newDiagramId(now = Date.now()): string {
  return `diag_${now.toString(36)}`;
}

export function nextNumericId(ids: Iterable<number>): number {
  let max = 0;
  for (const id of ids) {
    if (id > max) {
      max = id;
    }
  }
  return max + 1;
}
