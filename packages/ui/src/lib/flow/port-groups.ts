import { catalogPortName } from "@bld/xml";
import type { PortView } from "./types";

export interface PortGroup {
  catalogName: string;
  label: string;
  vectorized: boolean;
  ports: PortView[];
}

/** Group slotted `name` / `name[n]` ports and mark vector/vararg rails. */
export function groupPortViews(ports: readonly PortView[]): PortGroup[] {
  const groups: PortGroup[] = [];
  const index = new Map<string, PortGroup>();
  for (const port of ports) {
    const catalogName = catalogPortName(port.name);
    const existing = index.get(catalogName);
    if (existing) {
      existing.ports.push(port);
      existing.vectorized = true;
      continue;
    }
    const group: PortGroup = {
      catalogName,
      label: port.vararg ? `${catalogName}…` : catalogName,
      vectorized: Boolean(port.vectorized || port.vararg),
      ports: [port],
    };
    index.set(catalogName, group);
    groups.push(group);
  }
  return groups;
}
