import type { Attribute } from "../blocks/ast";
import { BLOCK_PARAMETER_KINDS, isBlockParameterKind, type BlockParameterKind } from "../blocks/ast";

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

export interface EntityMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  name?: string;
  description?: string;
  attributes: Attribute[];
}

export interface ParameterValue extends EntityMeta {
  kind: ParameterKind;
  name: string;
  value: string;
}

export interface DiagramBlock extends EntityMeta {
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parameters: ParameterValue[];
}

export interface ConnectorEndpoint extends EntityMeta {
  block: string;
  port?: string;
  index: number;
}

export interface DiagramConnector extends EntityMeta {
  input: ConnectorEndpoint;
  output: ConnectorEndpoint;
}

export interface DiagramDocument extends EntityMeta {
  catalogs: string[];
  blocks: DiagramBlock[];
  connectors: DiagramConnector[];
}

export interface BlockExtras {
  xmlId: string;
  createdAt: string;
  updatedAt: string;
  name?: string;
  description?: string;
  width?: number;
  height?: number;
  attributes: Attribute[];
  parameters: ParameterValue[];
}
