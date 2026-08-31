import { nearlyEqual, snapCoord, type Point } from "./coordinates";

function unitTangent(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { x: 1, y: 0 };
  }
  return { x: dx / len, y: dy / len };
}

function leftNormal(dir: Point): Point {
  return { x: -dir.y, y: dir.x };
}

function dedupePoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && nearlyEqual(prev.x, point.x, 0.05) && nearlyEqual(prev.y, point.y, 0.05)) {
      continue;
    }
    out.push({ ...point });
  }
  return out;
}

/** Outline of a (possibly rounded) polyline stroke, for CSS `clip-path: polygon(...)`. */
export function strokePolygon(points: Point[], width: number): Point[] {
  const simplified = dedupePoints(points);
  if (simplified.length < 2 || !(width > 0)) {
    return [];
  }
  const h = width / 2;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < simplified.length; i += 1) {
    const curr = simplified[i]!;
    const prev = i > 0 ? simplified[i - 1]! : null;
    const next = i < simplified.length - 1 ? simplified[i + 1]! : null;
    const tin = prev ? unitTangent(prev, curr) : next ? unitTangent(curr, next) : { x: 1, y: 0 };
    const tout = next ? unitTangent(curr, next) : tin;
    const nIn = leftNormal(tin);
    const nOut = leftNormal(tout);
    if (!prev || !next || (Math.abs(nIn.x - nOut.x) < 1e-6 && Math.abs(nIn.y - nOut.y) < 1e-6)) {
      left.push({ x: curr.x + nOut.x * h, y: curr.y + nOut.y * h });
      right.push({ x: curr.x - nOut.x * h, y: curr.y - nOut.y * h });
      continue;
    }
    const mx = nIn.x + nOut.x;
    const my = nIn.y + nOut.y;
    const denom = mx * nIn.x + my * nIn.y;
    const scale = denom === 0 ? h : h / denom;
    left.push({ x: curr.x + mx * scale, y: curr.y + my * scale });
    right.push({ x: curr.x - mx * scale, y: curr.y - my * scale });
  }
  return [...left, ...right.reverse()];
}

export interface StrokeRun {
  x: number;
  y: number;
  length: number;
  angleDeg: number;
}

/** Consecutive samples as rotated stroke runs for dash animation along jumpover curves. */
export function strokeRuns(points: Point[]): StrokeRun[] {
  const runs: StrokeRun[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const point = points[index]!;
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.05) {
      continue;
    }
    runs.push({
      x: prev.x,
      y: prev.y,
      length,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  return runs;
}

export function cssPolygon(points: Point[]): string {
  if (points.length < 3) {
    return "none";
  }
  return `polygon(${points.map((point) => `${snapCoord(point.x)}px ${snapCoord(point.y)}px`).join(", ")})`;
}
