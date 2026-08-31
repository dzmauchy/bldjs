import type { Attribute } from "../blocks/ast";

/** Placed canvas block. Positions are UI layout, not part of the catalog model. */
export interface BlockInstance {
  id: number;
  defId: string;
  x: number;
  y: number;
}

export type ParameterKind =
  | "integer-parameter"
  | "count-parameter"
  | "decimal-parameter"
  | "duration-parameter"
  | "date-parameter"
  | "time-parameter"
  | "date-time-parameter"
  | "integer-range-parameter"
  | "double-range-parameter"
  | "text-parameter";

export const PARAMETER_KINDS: readonly ParameterKind[] = [
  "integer-parameter",
  "count-parameter",
  "decimal-parameter",
  "duration-parameter",
  "date-parameter",
  "time-parameter",
  "date-time-parameter",
  "integer-range-parameter",
  "double-range-parameter",
  "text-parameter",
];

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
