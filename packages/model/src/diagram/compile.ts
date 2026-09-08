import type { Catalog } from "../blocks/catalog";
import type { Link } from "../blocks/diagram";
import { infer } from "../blocks/diagram";
import type { ResolvedBlock } from "../blocks/resolve";
import { isResolvedCompatible } from "../blocks/resolve";
import {
  COUNT_PARAM,
  DEF_PARAM,
  METER_PARAM,
  PERIOD_PARAM,
  PIN_PARAM,
  VALUE_PARAM,
  WINDOW_PARAM,
  ZETA_PARAM,
  OMEGA_PARAM,
  isEventDrivenGenerator,
  meterMsFrom,
  periodMsFrom,
  pinFrom,
  windowSecondsFrom,
  zetaFrom,
  omegaFrom,
  valueFrom,
  defFrom,
  countFrom,
} from "../blocks/cs/ids";
import { parseDiagram, type CanvasInput } from "./json";
import type { CanvasDiagram } from "./types";

export class DiagramCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagramCompileError";
  }
}

export interface DiagramSolution {
  json: string;
  canvas: CanvasDiagram;
  nodes: Array<{
    id: number;
    defId: string;
    periodMs?: number;
    pin?: number;
    zeta?: number;
    omega?: number;
    value?: number;
    count?: number;
    def?: number;
    windowS?: number;
    meterMs?: number;
  }>;
  links: Link[];
  inferred: Map<number, ResolvedBlock>;
}

function param(canvas: CanvasDiagram, blockId: number, name: string): string | undefined {
  return canvas.extras.get(blockId)?.parameters.find((item) => item.name === name)?.value;
}

/** Parse diagram TypeScript, then infer types. Worker compilation happens after this step. */
export function loadDiagramSolution(json: string, catalog: Catalog): DiagramSolution {
  const canvas = parseDiagram(json);
  for (const block of canvas.blocks) {
    if (!catalog.block(block.defId)) {
      throw new DiagramCompileError(`unknown block type \`${block.defId}\``);
    }
  }
  const nodes = canvas.blocks.map((block) => {
    const period = param(canvas, block.id, PERIOD_PARAM);
    const pin = param(canvas, block.id, PIN_PARAM);
    const zeta = param(canvas, block.id, ZETA_PARAM);
    const omega = param(canvas, block.id, OMEGA_PARAM);
    const value = param(canvas, block.id, VALUE_PARAM);
    const count = param(canvas, block.id, COUNT_PARAM);
    const def = param(canvas, block.id, DEF_PARAM);
    const window = param(canvas, block.id, WINDOW_PARAM);
    const meter = param(canvas, block.id, METER_PARAM);
    return {
      id: block.id,
      defId: block.defId,
      periodMs: isEventDrivenGenerator(block.defId) ? 0 : periodMsFrom(period),
      pin: pin == null ? undefined : pinFrom(pin),
      zeta: block.defId === "overshoot" ? zetaFrom(zeta) : undefined,
      omega: block.defId === "overshoot" ? omegaFrom(omega) : undefined,
      value: block.defId === "constant" ? valueFrom(value) : undefined,
      count: block.defId === "product" ? countFrom(count) : undefined,
      def: block.defId === "product" ? defFrom(def) : undefined,
      windowS: block.defId === "scope" ? windowSecondsFrom(window) : undefined,
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
  return { json, canvas, nodes, links: canvas.links, inferred };
}

export type { CanvasInput };
