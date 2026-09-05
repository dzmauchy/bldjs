import type { Catalog } from "../blocks/catalog";
import type { Link } from "../blocks/diagram";
import { infer } from "../blocks/diagram";
import type { ResolvedBlock } from "../blocks/resolve";
import { isResolvedCompatible } from "../blocks/resolve";
import {
  METER_PARAM,
  PERIOD_PARAM,
  PIN_PARAM,
  WINDOW_PARAM,
  isEventDrivenGenerator,
  meterMsFrom,
  periodMsFrom,
  pinFrom,
  sampleCountFrom,
} from "../blocks/cs/ids";
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
  nodes: Array<{ id: number; defId: string; periodMs?: number; pin?: number; sampleCount?: number; meterMs?: number }>;
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
  const nodes = canvas.blocks.map((block) => {
    const extra = canvas.extras.get(block.id);
    const period = extra?.parameters.find((param) => param.name === PERIOD_PARAM)?.value;
    const pin = extra?.parameters.find((param) => param.name === PIN_PARAM)?.value;
    const window = extra?.parameters.find((param) => param.name === WINDOW_PARAM)?.value;
    const meter = extra?.parameters.find((param) => param.name === METER_PARAM)?.value;
    return {
      id: block.id,
      defId: block.defId,
      periodMs: isEventDrivenGenerator(block.defId) ? 0 : periodMsFrom(period),
      pin: pin == null ? undefined : pinFrom(pin),
      sampleCount: block.defId === "scope" ? sampleCountFrom(window) : undefined,
      meterMs: block.defId === "scope" ? meterMsFrom(meter) : undefined,
    };
  });
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
