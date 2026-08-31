import { describe, expect, it } from "vitest";
import {
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  NONE_ID,
  allBlockKinds,
  blockKindFromDragKey,
  blockOriginFromDrop,
  clampZoom,
  compactUiMatches,
  COMPACT_UI_MAX_HEIGHT,
  COMPACT_UI_QUERY,
  isNoneId,
  kindDragKey,
  phoneScreenMatches,
  screenToWorld,
  viewportMetaContent,
  applyViewportMeta,
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

  it("centers a dropped block on the pointer", () => {
    expect(blockOriginFromDrop(200, 120)).toEqual({
      x: 200 - BLOCK_WIDTH / 2,
      y: 120 - BLOCK_HEIGHT / 2,
    });
    expect(blockOriginFromDrop(0, 0)).toEqual({
      x: -BLOCK_WIDTH / 2,
      y: -BLOCK_HEIGHT / 2,
    });
  });

  it("locks the viewport meta at scale 1", () => {
    expect(viewportMetaContent()).toBe(
      "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
    );
  });

  it("treats a short screen edge as a phone", () => {
    const original = globalThis.screen;
    const screen = { width: 390, height: 844 };
    Object.defineProperty(globalThis, "screen", { configurable: true, value: screen });
    expect(phoneScreenMatches()).toBe(true);
    screen.width = 844;
    screen.height = 390;
    expect(phoneScreenMatches()).toBe(true);
    screen.width = 1440;
    screen.height = 900;
    expect(phoneScreenMatches()).toBe(false);
    screen.width = 0;
    screen.height = 0;
    expect(phoneScreenMatches()).toBe(false);
    Object.defineProperty(globalThis, "screen", { configurable: true, value: original });
  });

  it("keeps compact UI on a landscape phone viewport", () => {
    const originalScreen = globalThis.screen;
    const originalMatch = globalThis.matchMedia;
    const restore = () => {
      Object.defineProperty(globalThis, "screen", { configurable: true, value: originalScreen });
      globalThis.matchMedia = originalMatch;
    };
    const mock = (width: number, height: number, screenW: number, screenH: number) => {
      Object.defineProperty(globalThis, "screen", {
        configurable: true,
        value: { width: screenW, height: screenH },
      });
      globalThis.matchMedia = ((query: string) => {
        const matches = query.split(",").some((part) => {
          const maxWidth = /max-width:\s*(\d+)/.exec(part);
          if (maxWidth) {
            return width <= Number(maxWidth[1]);
          }
          const maxHeight = /max-height:\s*(\d+)/.exec(part);
          return maxHeight ? height <= Number(maxHeight[1]) : false;
        });
        return {
          matches,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() {
            return false;
          },
        } as MediaQueryList;
      }) as typeof matchMedia;
    };
    expect(COMPACT_UI_QUERY).toContain(`max-height: ${COMPACT_UI_MAX_HEIGHT}px`);
    mock(844, 390, 1440, 900);
    expect(compactUiMatches()).toBe(true);
    mock(1400, 900, 1440, 900);
    expect(compactUiMatches()).toBe(false);
    mock(844, 390, 844, 390);
    expect(compactUiMatches()).toBe(true);
    restore();
  });

  it("writes the locked viewport meta onto the document tag", () => {
    const meta = document.createElement("meta");
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=0.7";
    document.head.append(meta);
    applyViewportMeta();
    expect(meta.content).toBe(viewportMetaContent());
    meta.remove();
  });
});
