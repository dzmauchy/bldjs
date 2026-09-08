import type { Attribute } from "../blocks/ast";
import { BLOCK_PARAMETER_KINDS, isBlockParameterKind, type BlockParameterKind } from "../blocks/ast";
import type { Link } from "../blocks/diagram";

/** Placed canvas block. Positions are UI layout, not part of the catalog model. */
export interface BlockInstance {
  id: number;
  defId: string;
  x: number;
  y: number;
}

export type ParameterKind = BlockParameterKind;

export const PARAMETER_KINDS: readonly ParameterKind[] = BLOCK_PARAMETER_KINDS;

export const isParameterKind = isBlockParameterKind;

export interface ParameterValue {
  kind: ParameterKind;
  name: string;
  value: string;
}

export interface BlockExtras {
  name?: string;
  description?: string;
  width?: number;
  height?: number;
  parameters: ParameterValue[];
}

export interface CanvasDiagram {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  attributes: Attribute[];
  catalogs: string[];
  blocks: BlockInstance[];
  links: Link[];
  extras: Map<number, BlockExtras>;
  nextId: number;
}
