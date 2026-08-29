import { type BlockDef } from "./ast";
import { Catalog } from "./catalog";
import { ParseError } from "./parse";
import {
  type Grounding,
  type ResolvedBlock,
  TypeResolver,
  pushGrounding,
  resolvedOutput,
} from "./resolve";

export interface XmlSource {
  name: string;
  content: string;
}

export interface DiagramNode {
  id: number;
  defId: string;
}

export interface Link {
  fromBlock: number;
  fromOut: string;
  toBlock: number;
  toIn: string;
}

export function linksEqual(a: Link, b: Link): boolean {
  return (
    a.fromBlock === b.fromBlock && a.fromOut === b.fromOut && a.toBlock === b.toBlock && a.toIn === b.toIn
  );
}

export class Diagram {
  id: string;
  name: string;
  private sourceList: XmlSource[] = [];
  private catalogInner = new Catalog();
  private nodeList: DiagramNode[] = [];
  private linkList: Link[] = [];
  private nextId = 1;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  sources(): XmlSource[] {
    return this.sourceList;
  }

  catalog(): Catalog {
    return this.catalogInner;
  }

  nodes(): DiagramNode[] {
    return this.nodeList;
  }

  links(): Link[] {
    return this.linkList;
  }

  associateXml(name: string, content: string): void {
    const source: XmlSource = { name, content };
    const catalog = cloneCatalog(this.catalogInner, this.sourceList);
    catalog.addXml(source.name, source.content);
    this.catalogInner = catalog;
    this.sourceList.push(source);
  }

  dissociateXml(name: string): void {
    if (!this.sourceList.some((source) => source.name === name)) {
      throw ParseError.new(`model \`${name}\` is not associated`);
    }
    const remaining = this.sourceList.filter((source) => source.name !== name);
    const catalog = new Catalog();
    for (const source of remaining) {
      catalog.addXml(source.name, source.content);
    }
    const known = new Set(catalog.blocks().map((block) => block.id));
    this.nodeList = this.nodeList.filter((node) => known.has(node.defId));
    const live = new Set(this.nodeList.map((node) => node.id));
    this.linkList = this.linkList.filter((link) => live.has(link.fromBlock) && live.has(link.toBlock));
    this.sourceList = remaining;
    this.catalogInner = catalog;
  }

  addNode(defId: string): number {
    const id = this.nextId;
    this.nextId += 1;
    this.nodeList.push({ id, defId });
    return id;
  }

  removeNode(id: number): void {
    this.nodeList = this.nodeList.filter((node) => node.id !== id);
    this.linkList = this.linkList.filter((link) => link.fromBlock !== id && link.toBlock !== id);
  }

  addLink(fromBlock: number, fromOut: string, toBlock: number, toIn: string): void {
    const link: Link = { fromBlock, fromOut, toBlock, toIn };
    if (!this.linkList.some((item) => linksEqual(item, link))) {
      this.linkList.push(link);
    }
  }

  removeLink(link: Link): void {
    this.linkList = this.linkList.filter((item) => !linksEqual(item, link));
  }

  blockDef(defId: string): BlockDef | undefined {
    return this.catalogInner.block(defId);
  }

  resolveNode(id: number): ResolvedBlock | undefined {
    return this.resolveAll().get(id);
  }

  resolveAll(): Map<number, ResolvedBlock> {
    return infer(
      this.catalogInner,
      this.nodeList.map((node) => [node.id, node.defId] as const),
      this.linkList,
    );
  }
}

function cloneCatalog(catalog: Catalog, sources: XmlSource[]): Catalog {
  const next = new Catalog();
  for (const source of sources) {
    next.addXml(source.name, source.content);
  }
  void catalog;
  return next;
}

export function infer(
  catalog: Catalog,
  nodes: ReadonlyArray<readonly [number, string]>,
  links: Link[],
): Map<number, ResolvedBlock> {
  const resolver = new TypeResolver(catalog);
  const memo = new Map<number, ResolvedBlock>();
  const visiting = new Set<number>();
  const defIds = new Map<number, string>(nodes);

  const rec = (id: number): void => {
    if (memo.has(id)) {
      return;
    }
    const defId = defIds.get(id);
    if (!defId) {
      return;
    }
    const block = catalog.block(defId);
    if (!block) {
      return;
    }
    if (visiting.has(id)) {
      memo.set(id, resolver.resolve(block, new Map()));
      return;
    }
    visiting.add(id);

    const grounded = new Map<string, Grounding>();
    for (const link of links.filter((item) => item.toBlock === id)) {
      rec(link.fromBlock);
      const output = memo.has(link.fromBlock)
        ? resolvedOutput(memo.get(link.fromBlock)!, link.fromOut)
        : undefined;
      if (!output) {
        continue;
      }
      const vararg = block.inputs.find((port) => port.name === link.toIn)?.vararg ?? false;
      const existing = grounded.get(link.toIn);
      if (existing) {
        grounded.set(link.toIn, pushGrounding(existing, output));
      } else if (vararg) {
        grounded.set(link.toIn, { kind: "varargs", items: [output] });
      } else {
        grounded.set(link.toIn, { kind: "single", ty: output });
      }
    }

    memo.set(id, resolver.resolve(block, grounded));
    visiting.delete(id);
  };

  for (const [id] of nodes) {
    rec(id);
  }
  return memo;
}
