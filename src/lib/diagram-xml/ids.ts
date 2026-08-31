const XML_ID = /^[A-Za-z_][\w.-]*$/;
const BLOCK_NUMERIC = /^blk_(\d+)$/;

export function isXmlId(value: string): boolean {
  return XML_ID.test(value);
}

export function blockXmlId(numericId: number): string {
  return `blk_${numericId}`;
}

export function connectorXmlId(index: number): string {
  return `conn_${index}`;
}

export function endpointXmlId(kind: "in" | "out", index: number): string {
  return `ep_${kind}_${index}`;
}

export function newDiagramId(now = Date.now()): string {
  return `diag_${now.toString(36)}`;
}

export function parseBlockNumericId(xmlId: string): number | undefined {
  const match = BLOCK_NUMERIC.exec(xmlId);
  if (!match) {
    return undefined;
  }
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** Map each XML block id to a positive numeric canvas id, preferring `blk_N`. */
export function allocateNumericIds(xmlIds: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  const used = new Set<number>();
  for (const xmlId of xmlIds) {
    const numeric = parseBlockNumericId(xmlId);
    if (numeric !== undefined && !used.has(numeric)) {
      map.set(xmlId, numeric);
      used.add(numeric);
    }
  }
  let next = 1;
  const take = (): number => {
    while (used.has(next)) {
      next += 1;
    }
    const id = next;
    used.add(id);
    next += 1;
    return id;
  };
  for (const xmlId of xmlIds) {
    if (!map.has(xmlId)) {
      map.set(xmlId, take());
    }
  }
  return map;
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
