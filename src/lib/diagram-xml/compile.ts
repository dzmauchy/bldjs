import type { Catalog } from "$lib/blocks/catalog";
import type { Link } from "$lib/blocks/diagram";
import { infer } from "$lib/blocks/diagram";
import type { ResolvedBlock } from "$lib/blocks/resolve";
import { isResolvedCompatible } from "$lib/blocks/resolve";
import { documentToCanvas, parseDiagramXml } from "./xml";
import type { DiagramDocument } from "./types";

export class DiagramCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagramCompileError";
  }
}

export interface DiagramSolution {
  xml: string;
  doc: DiagramDocument;
  nodes: Array<{ id: number; defId: string }>;
  links: Link[];
  inferred: Map<number, ResolvedBlock>;
}

/**
 * Parse diagram XML, then infer types. WASM assembly happens after this step.
 */
export function loadDiagramSolution(xml: string, catalog: Catalog): DiagramSolution {
  const doc = parseDiagramXml(xml);
  const canvas = documentToCanvas(doc);
  for (const block of canvas.blocks) {
    if (!catalog.block(block.defId)) {
      throw new DiagramCompileError(`unknown block type \`${block.defId}\``);
    }
  }
  const nodes = canvas.blocks.map((block) => ({ id: block.id, defId: block.defId }));
  const inferred = infer(
    catalog,
    nodes.map((node) => [node.id, node.defId] as const),
    canvas.links,
  );
  for (const link of canvas.links) {
    const resolved = inferred.get(link.toBlock);
    if (resolved && !isResolvedCompatible(resolved, link.toIn)) {
      throw new DiagramCompileError(
        `incompatible wire into \`${link.toIn}\` on block ${link.toBlock} (${resolved.defId})`,
      );
    }
  }
  return { xml, doc, nodes, links: canvas.links, inferred };
}
