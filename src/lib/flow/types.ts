import type { PortPlace } from "$lib/blocks";
import type { Point } from "./geometry";

export type PortSide = "in" | "out";
export type { PortPlace };

export interface PortView {
  name: string;
  typeLabel: string;
  place: PortPlace;
  vararg: boolean;
  grounded?: boolean;
  compatible?: boolean;
  linking?: boolean;
}

export interface BldNodeState {
  blockId: number;
  defId: string;
  name: string;
  icon: string | null;
  kindClass: string;
  selected: boolean;
  paramsLine: string;
  showChart: boolean;
  chartEnabled: boolean;
  inputs: PortView[];
  outputs: PortView[];
}

export interface PortPointerDetail {
  blockId: number;
  port: string;
  side: PortSide;
  clientX: number;
  clientY: number;
  pointerId: number;
}

export interface PortAnchor extends Point {
  place?: PortPlace;
}

export interface NodeLayout {
  width: number;
  height: number;
  ports: {
    in: Record<string, PortAnchor>;
    out: Record<string, PortAnchor>;
  };
}

export interface ConnectorEndpoints {
  from: Point;
  to: Point;
}
