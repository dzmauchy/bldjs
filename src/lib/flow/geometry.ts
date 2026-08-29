import { screenToWorld } from "$lib/model";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CubicLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  d: string;
}

const MIN_HANDLE = 40;
const HANDLE_RATIO = 0.45;

export function cubicLink(from: Point, to: Point): CubicLink {
  const dx = Math.max(Math.abs(to.x - from.x) * HANDLE_RATIO, MIN_HANDLE);
  const c1x = from.x + dx;
  const c1y = from.y;
  const c2x = to.x - dx;
  const c2y = to.y;
  return {
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    c1x,
    c1y,
    c2x,
    c2y,
    d: `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`,
  };
}

export function cubicLinkBounds(link: CubicLink, pad = 16): Rect {
  const xs = [link.x1, link.c1x, link.c2x, link.x2];
  const ys = [link.y1, link.c1y, link.c2y, link.y2];
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  const right = Math.max(...xs) + pad;
  const bottom = Math.max(...ys) + pad;
  return {
    left,
    top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  };
}

export function translatePath(link: CubicLink, origin: Point): string {
  const dx = origin.x;
  const dy = origin.y;
  return `M ${link.x1 - dx} ${link.y1 - dy} C ${link.c1x - dx} ${link.c1y - dy}, ${link.c2x - dx} ${link.c2y - dy}, ${link.x2 - dx} ${link.y2 - dy}`;
}

export function clientToWorld(
  clientX: number,
  clientY: number,
  viewport: Pick<DOMRect, "left" | "top">,
  panX: number,
  panY: number,
  zoom: number,
): Point {
  const [x, y] = screenToWorld(clientX - viewport.left, clientY - viewport.top, panX, panY, zoom);
  return { x, y };
}

export function linkKey(fromBlock: number, fromOut: string, toBlock: number, toIn: string): string {
  return `${fromBlock}:${fromOut}->${toBlock}:${toIn}`;
}
