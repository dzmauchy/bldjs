export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3.0;
export const GRID_SIZE = 24.0;
export const BLOCK_WIDTH = 180.0;
export const BLOCK_HEIGHT = 88.0;
/** Spacing used when dropping a palette item at the view center. Wider than BLOCK_WIDTH so long inferred types do not overlap. */
export const BLOCK_PLACE_WIDTH = 320.0;
export const BLOCK_PLACE_HEIGHT = 130.0;
/** Narrow or short viewports overlay the palette so the canvas can use the full width. */
export const COMPACT_UI_MAX_WIDTH = 720;
export const COMPACT_UI_MAX_HEIGHT = 520;
export const COMPACT_UI_QUERY = `(max-width: ${COMPACT_UI_MAX_WIDTH}px), (max-height: ${COMPACT_UI_MAX_HEIGHT}px)`;
export const PORT_HEADER = 34.0;
export const PORT_PARAM = 18.0;
export const PORT_ROW = 24.0;
/** Sentinel block id meaning "no block" (nothing selected, no badge, not dragging). */
export const NONE_ID = -1;

export function isNoneId(id: number): boolean {
  return id === NONE_ID;
}

export function compactUiMatches(): boolean {
  return (
    phoneScreenMatches() ||
    (typeof globalThis.matchMedia === "function" && globalThis.matchMedia(COMPACT_UI_QUERY).matches)
  );
}

/** Shortest screen edge is phone-sized, including landscape. */
export function phoneScreenMatches(): boolean {
  const width = globalThis.screen?.width;
  const height = globalThis.screen?.height;
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return false;
  }
  return Math.min(width, height) <= COMPACT_UI_MAX_WIDTH;
}

export function viewportMetaContent(): string {
  return "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
}

/** Lock the layout viewport at scale 1 so phone pan/scroll stay on the app, not the browser chrome. */
export function applyViewportMeta(): void {
  if (typeof document === "undefined") {
    return;
  }
  const meta = document.querySelector('meta[name="viewport"]');
  if (!(meta instanceof HTMLMetaElement)) {
    return;
  }
  meta.content = viewportMetaContent();
}

/** Top-left origin that puts the placed block's center on the drop point. */
export function blockOriginFromDrop(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: worldX - BLOCK_WIDTH / 2,
    y: worldY - BLOCK_HEIGHT / 2,
  };
}

export const BLOCK_KINDS = ["Start", "Process", "Decision", "Data", "Output"] as const;
export type BlockKindName = (typeof BLOCK_KINDS)[number];

export interface BlockKindInfo {
  name: BlockKindName;
  label: string;
  hint: string;
  className: string;
  badgeClass: string;
  glyph: string;
}

const KIND_INFO: Record<BlockKindName, BlockKindInfo> = {
  Start: {
    name: "Start",
    label: "Start",
    hint: "Entry point for a flow",
    className: "block-kind-start",
    badgeClass: "text-bg-success",
    glyph: "▶",
  },
  Process: {
    name: "Process",
    label: "Process",
    hint: "Do some work",
    className: "block-kind-process",
    badgeClass: "text-bg-primary",
    glyph: "▣",
  },
  Decision: {
    name: "Decision",
    label: "Decision",
    hint: "Branch on a condition",
    className: "block-kind-decision",
    badgeClass: "text-bg-warning",
    glyph: "◆",
  },
  Data: {
    name: "Data",
    label: "Data",
    hint: "Read or write data",
    className: "block-kind-data",
    badgeClass: "text-bg-info",
    glyph: "☰",
  },
  Output: {
    name: "Output",
    label: "Output",
    hint: "Emit a result",
    className: "block-kind-output",
    badgeClass: "text-bg-danger",
    glyph: "■",
  },
};

export function allBlockKinds(): BlockKindInfo[] {
  return BLOCK_KINDS.map((name) => KIND_INFO[name]);
}

export function blockKindFromName(name: string): BlockKindInfo | undefined {
  return KIND_INFO[name as BlockKindName];
}

export function kindHasInput(kind: BlockKindName): boolean {
  return kind !== "Start";
}

export function kindOutputLabels(kind: BlockKindName): string[] {
  switch (kind) {
    case "Start":
    case "Process":
    case "Data":
      return ["out"];
    case "Decision":
      return ["true", "false"];
    case "Output":
      return [];
  }
}

export function kindDragKey(kind: BlockKindName): string {
  return `bld:${kind}`;
}

export function blockKindFromDragKey(key: string): BlockKindInfo | undefined {
  return allBlockKinds().find((kind) => kindDragKey(kind.name) === key);
}

export function blockCardHeight(inputCount: number, outputCount: number, hasParams: boolean): number {
  const rows = Math.max(inputCount, outputCount, 1);
  return PORT_HEADER + (hasParams ? PORT_PARAM : 0) + rows * PORT_ROW + 10.0;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Wheel-delta → multiplicative zoom factor used by the canvas. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.min(1.25, Math.max(0.8, 1 - deltaY * 0.0015));
}

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

/** Pan/zoom that keeps the cursor's world point fixed. `null` when zoom is unchanged. */
export function zoomViewport(
  viewport: Viewport,
  factor: number,
  cursorX: number,
  cursorY: number,
): Viewport | null {
  const oldZoom = viewport.zoom;
  const newZoom = clampZoom(oldZoom * factor);
  if (Math.abs(newZoom - oldZoom) < Number.EPSILON) {
    return null;
  }
  const [panX, panY] = zoomToward(oldZoom, newZoom, cursorX, cursorY, viewport.panX, viewport.panY);
  return { panX, panY, zoom: newZoom };
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number,
): [number, number] {
  return [(screenX - panX) / zoom, (screenY - panY) / zoom];
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  panX: number,
  panY: number,
  zoom: number,
): [number, number] {
  return [worldX * zoom + panX, worldY * zoom + panY];
}

export function zoomToward(
  oldZoom: number,
  newZoom: number,
  cursorX: number,
  cursorY: number,
  panX: number,
  panY: number,
): [number, number] {
  const [worldX, worldY] = screenToWorld(cursorX, cursorY, panX, panY, oldZoom);
  return [cursorX - worldX * newZoom, cursorY - worldY * newZoom];
}
