import type { BlockDef } from "@bld/xml/blocks/ast";
import type { Catalog } from "@bld/xml/blocks/catalog";

export interface PaletteGroup {
  id: string;
  label: string;
  blocks: BlockDef[];
  children: PaletteGroup[];
}

export function buildPaletteTree(catalog: Catalog): PaletteGroup[] {
  const byNs = new Map<string, BlockDef[]>();
  for (const block of catalog.blocks()) {
    const list = byNs.get(block.ns) ?? [];
    list.push(block);
    byNs.set(block.ns, list);
  }
  for (const blocks of byNs.values()) {
    blocks.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }

  const ids = new Set<string>([...byNs.keys(), ...catalog.namespaces.keys()]);
  for (const id of [...ids]) {
    let cursor: string | null = id;
    while (cursor) {
      const parent = catalog.namespaceParent(cursor);
      if (parent) {
        ids.add(parent);
      }
      cursor = parent;
    }
  }

  const nodes = new Map<string, PaletteGroup>();
  for (const id of ids) {
    nodes.set(id, {
      id,
      label: catalog.namespaceLabel(id),
      blocks: byNs.get(id) ?? [],
      children: [],
    });
  }

  const roots: PaletteGroup[] = [];
  for (const [id, node] of nodes) {
    const parent = catalog.namespaceParent(id);
    const parentNode = parent ? nodes.get(parent) : undefined;
    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortGroups = (groups: PaletteGroup[]): void => {
    groups.sort((left, right) => left.id.localeCompare(right.id));
    for (const group of groups) {
      sortGroups(group.children);
    }
  };
  sortGroups(roots);
  return prune(roots);
}

export function paletteGroupIds(groups: PaletteGroup[]): string[] {
  return groups.flatMap((group) => [group.id, ...paletteGroupIds(group.children)]);
}

function prune(groups: PaletteGroup[]): PaletteGroup[] {
  return groups
    .map((group) => ({ ...group, children: prune(group.children) }))
    .filter((group) => group.blocks.length > 0 || group.children.length > 0);
}
