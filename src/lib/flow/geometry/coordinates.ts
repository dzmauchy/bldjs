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

export function snapCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

export function nearlyEqual(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) < eps;
}

export function polylinePath(points: Point[]): string {
  if (points.length === 0) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

export function polylineBounds(points: Point[], pad = 16): Rect {
  if (points.length === 0) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
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

export function translatePolyline(points: Point[], origin: Point): Point[] {
  return points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }));
}

export function routesEqual(a: Point[] | undefined, b: Point[] | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((point, index) => point.x === b[index]!.x && point.y === b[index]!.y);
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

export function formatPolyline(points: Point[]): string {
  return points.map((point) => `${snapCoord(point.x)},${snapCoord(point.y)}`).join(" ");
}
