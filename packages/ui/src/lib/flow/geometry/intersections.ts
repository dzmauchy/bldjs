import { nearlyEqual, type Point } from "./coordinates";

export interface AxisSegment {
  axis: "h" | "v";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function axisAlignedSegments(points: Point[]): AxisSegment[] {
  const segments: AxisSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const point = points[index]!;
    if (nearlyEqual(prev.y, point.y) && !nearlyEqual(prev.x, point.x)) {
      segments.push({
        axis: "h",
        x1: Math.min(prev.x, point.x),
        y1: prev.y,
        x2: Math.max(prev.x, point.x),
        y2: point.y,
      });
    } else if (nearlyEqual(prev.x, point.x) && !nearlyEqual(prev.y, point.y)) {
      segments.push({
        axis: "v",
        x1: prev.x,
        y1: Math.min(prev.y, point.y),
        x2: point.x,
        y2: Math.max(prev.y, point.y),
      });
    }
  }
  return segments;
}

/** Longest collinear overlap of two orthogonal polylines. */
export function collinearOverlapLength(left: Point[], right: Point[], eps = 1): number {
  let longest = 0;
  for (const a of axisAlignedSegments(left)) {
    for (const b of axisAlignedSegments(right)) {
      if (a.axis !== b.axis) {
        continue;
      }
      if (a.axis === "h") {
        if (Math.abs(a.y1 - b.y1) > eps) {
          continue;
        }
        longest = Math.max(longest, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
      } else if (Math.abs(a.x1 - b.x1) <= eps) {
        longest = Math.max(longest, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
      }
    }
  }
  return longest;
}

/**
 * JointJS jumpover draws a hoop on every link that lists the other as a
 * crossing. Only earlier wires should be passed in, or both lines get an
 * overlap hoop at the same intersection.
 */
export function jumpoverUnderlays<T>(items: readonly T[], index: number): T[] {
  if (index <= 0) {
    return [];
  }
  return items.slice(0, index);
}
