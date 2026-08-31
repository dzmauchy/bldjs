export const FLOW_MIME = "application/x-bld-block";

export const PALETTE_DROP_EVENT = "bld-palette-drop";

export interface PaletteDropDetail {
  defId: string;
  clientX: number;
  clientY: number;
}
