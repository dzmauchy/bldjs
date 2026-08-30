import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  NONE_ID,
  allBlockKinds,
  blockKindFromDragKey,
  clampZoom,
  isNoneId,
  kindDragKey,
  screenToWorld,
  wheelZoomFactor,
  worldToScreen,
  zoomToward,
  zoomViewport,
} from "./model";

describe("model", () => {
  it("screen world roundtrip", () => {
    const [worldX, worldY] = screenToWorld(150, 80, 50, 20, 2);
    expect(Math.abs(worldX - 50)).toBeLessThan(1e-9);
    expect(Math.abs(worldY - 30)).toBeLessThan(1e-9);
    const [screenX, screenY] = worldToScreen(worldX, worldY, 50, 20, 2);
    expect(Math.abs(screenX - 150)).toBeLessThan(1e-9);
    expect(Math.abs(screenY - 80)).toBeLessThan(1e-9);
  });

  it("zoom keeps cursor world point", () => {
    const panX = 40;
    const panY = 10;
    const oldZoom = 1;
    const newZoom = 2;
    const cursorX = 120;
    const cursorY = 90;
    const [newPanX, newPanY] = zoomToward(oldZoom, newZoom, cursorX, cursorY, panX, panY);
    const before = screenToWorld(cursorX, cursorY, panX, panY, oldZoom);
    const after = screenToWorld(cursorX, cursorY, newPanX, newPanY, newZoom);
    expect(Math.abs(before[0] - after[0])).toBeLessThan(1e-9);
    expect(Math.abs(before[1] - after[1])).toBeLessThan(1e-9);
  });

  it("drag keys roundtrip", () => {
    for (const kind of allBlockKinds()) {
      expect(blockKindFromDragKey(kindDragKey(kind.name))?.name).toBe(kind.name);
    }
    expect(blockKindFromDragKey("nope")).toBeUndefined();
  });

  it("clamp zoom limits", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it("converts wheel delta into a clamped zoom factor", () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(1000)).toBe(0.8);
    expect(wheelZoomFactor(-1000)).toBe(1.25);
  });

  it("zoomViewport keeps the cursor world point", () => {
    const next = zoomViewport({ panX: 40, panY: 10, zoom: 1 }, 2, 120, 90);
    expect(next).not.toBeNull();
    const before = screenToWorld(120, 90, 40, 10, 1);
    const after = screenToWorld(120, 90, next!.panX, next!.panY, next!.zoom);
    expect(Math.abs(before[0] - after[0])).toBeLessThan(1e-9);
    expect(Math.abs(before[1] - after[1])).toBeLessThan(1e-9);
    expect(zoomViewport({ panX: 0, panY: 0, zoom: MAX_ZOOM }, 2, 0, 0)).toBeNull();
  });

  it("none id is negative sentinel", () => {
    expect(NONE_ID).toBe(-1);
    expect(isNoneId(NONE_ID)).toBe(true);
    expect(isNoneId(0)).toBe(false);
    expect(isNoneId(1)).toBe(false);
  });
});
